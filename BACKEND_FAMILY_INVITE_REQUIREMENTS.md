# Backend Requirements for Family Invitation System

## Overview
This document outlines the backend API changes required to support email-based family invitations with clickable links instead of manual invitation codes.

## Required Backend Changes

### 1. Update POST `/household/invite` Endpoint

**Current Behavior:**
- Creates an invitation with a code
- Returns the invitation code
- User manually shares the code

**New Required Behavior:**
- Create an invitation with a unique token (UUID or similar)
- Send an email to the invited user with a clickable link
- Return success response (no need to return the token to the inviter)

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Invitation email sent successfully"
}
```

**Email Template Required:**
The backend should send an email with:
- Subject: "Perhekutsu Arkiapuriin" or similar
- Body should include:
  - Who invited them (household owner/inviter name)
  - Household name
  - Clickable link to accept invitation
  - Link format: `https://yourdomain.com/accept-invite/{invitationToken}`
  
**Example Email Body:**
```
Hei!

{InviterName} on kutsunut sinut liittymään perheeseen "{HouseholdName}" Arkiapuri-sovelluksessa.

Hyväksy kutsu klikkaamalla alla olevaa linkkiä:
[Hyväksy kutsu]

Jos sinulla ei ole vielä Arkiapuri-tiliä, voit luoda sen kutsun hyväksymisen yhteydessä.

Kutsu vanhenee 7 päivän kuluttua.

Terveisin,
Arkiapuri-tiimi
```

### 2. Create GET `/household/invitation/:token` Endpoint

**Purpose:** Validate and retrieve invitation details before acceptance

**Request:**
- GET request to `/household/invitation/:token`
- No authentication required (invitation token validates the request)

**Response (Success):**
```json
{
  "success": true,
  "invitation": {
    "_id": "invitation_id",
    "email": "invited@example.com",
    "status": "pending",
    "household": {
      "_id": "household_id",
      "name": "Smith Family",
      "members": [
        {
          "userId": { "username": "user1", "email": "user1@example.com" },
          "role": "owner"
        }
      ]
    },
    "invitedBy": {
      "_id": "user_id",
      "username": "John Smith",
      "email": "john@example.com"
    },
    "createdAt": "2024-01-15T10:30:00Z",
    "expiresAt": "2024-01-22T10:30:00Z"
  }
}
```

**Response (Error - Invalid/Expired):**
```json
{
  "success": false,
  "message": "Kutsu on vanhentunut tai virheellinen"
}
```

**Validation Rules:**
- Token must exist in database
- Invitation status must be "pending"
- Invitation must not be expired
- Should populate household and invitedBy details

### 3. Create POST `/household/accept-invite` Endpoint

**Purpose:** Accept an invitation and join the household

**Request:**
```json
{
  "invitationToken": "unique-token-here"
}
```

**Headers:**
```
Authorization: Bearer {userToken}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Successfully joined household",
  "household": {
    "_id": "household_id",
    "name": "Smith Family",
    "members": [...]
  }
}
```

**Response (Error):**
```json
{
  "success": false,
  "message": "Kutsu on vanhentunut tai virheellinen"
}
```

**Backend Logic:**
1. Verify invitation token exists and is valid
2. Check invitation status is "pending"
3. Check invitation hasn't expired
4. Verify user is authenticated
5. Add user to household as a member
6. Update invitation status to "accepted"
7. Optional: Check if user email matches invitation email (warning if mismatch, but allow join)
8. Return updated household data

### 4. Update Invitation Model

**Required Fields:**
```javascript
{
  email: String,
  household: ObjectId (ref: 'Household'),
  invitedBy: ObjectId (ref: 'User'),
  invitationToken: String, // Unique token (UUID)
  invitationCode: String,  // Keep for backward compatibility if needed
  status: {
    type: String,
    enum: ['pending', 'accepted', 'declined', 'expired'],
    default: 'pending'
  },
  createdAt: Date,
  expiresAt: Date, // Auto-set to createdAt + 7 days
  acceptedAt: Date,
  acceptedBy: ObjectId (ref: 'User')
}
```

**Indexes:**
- `invitationToken` (unique)
- `email, household, status` (compound index for queries)

### 5. Email Service Integration

**Required:**
- Email service (e.g., SendGrid, AWS SES, Nodemailer)
- Email templates with HTML support
- Environment variables:
  ```
  EMAIL_SERVICE_API_KEY=your-api-key
  EMAIL_FROM_ADDRESS=noreply@arkiapuri.fi
  FRONTEND_URL=https://yourdomain.com (for generating links)
  ```

### 6. Invitation Expiry & Cleanup

**Optional but Recommended:**
- Scheduled job to mark expired invitations
- Run daily: Update invitations where `expiresAt < now()` and `status = 'pending'` to `status = 'expired'`
- Optional: Delete expired invitations after 30 days

## Security Considerations

1. **Token Generation:**
   - Use cryptographically secure random tokens (UUID v4 or similar)
   - Tokens should be at least 32 characters long
   - One-time use only

2. **Rate Limiting:**
   - Limit invitation emails per household (e.g., 10 per day)
   - Prevent spam/abuse

3. **Email Verification:**
   - Optional: Warn if invited email doesn't match accepting user's email
   - Allow join anyway (user might have multiple emails)

4. **Authorization:**
   - Only household owner or admins can send invitations
   - Anyone with a valid token can view invitation details
   - Must be authenticated to accept invitation

## Testing Checklist

- [ ] Email sends successfully when invitation is created
- [ ] Invitation token is unique and cryptographically secure
- [ ] GET invitation endpoint returns correct data
- [ ] Expired invitations are rejected
- [ ] Invalid tokens return appropriate errors
- [ ] User can accept invitation and join household
- [ ] Invitation status updates correctly after acceptance
- [ ] Rate limiting works for invitation creation
- [ ] Email template displays correctly in various email clients

## Migration Notes

If you have existing invitations with codes:
- Keep the `invitationCode` field for backward compatibility
- Add new `invitationToken` field
- Support both code-based and token-based acceptance temporarily
- Migrate old invitations or let them expire naturally

## Example Implementation (Node.js/Express)

```javascript
// POST /household/invite
router.post('/household/invite', authenticateUser, async (req, res) => {
  try {
    const { email } = req.body;
    const household = await Household.findOne({ 
      $or: [
        { owner: req.user._id },
        { 'members.userId': req.user._id, 'members.role': 'admin' }
      ]
    });

    if (!household) {
      return res.status(403).json({ 
        success: false, 
        message: 'No permission to invite members' 
      });
    }

    // Generate unique token
    const invitationToken = uuid.v4();
    
    // Create invitation
    const invitation = await Invitation.create({
      email,
      household: household._id,
      invitedBy: req.user._id,
      invitationToken,
      status: 'pending',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    });

    // Send email
    const inviteLink = `${process.env.FRONTEND_URL}/accept-invite/${invitationToken}`;
    await emailService.send({
      to: email,
      subject: 'Perhekutsu Arkiapuriin',
      template: 'family-invitation',
      data: {
        inviterName: req.user.username,
        householdName: household.name,
        inviteLink
      }
    });

    res.json({ 
      success: true, 
      message: 'Invitation email sent successfully' 
    });
  } catch (error) {
    console.error('Error sending invitation:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to send invitation' 
    });
  }
});
```

## Frontend Integration

The frontend has been updated to:
1. Show improved messaging about email invitations
2. Added `AcceptInviteScreen` component for handling invitation links
3. URL routing for `/accept-invite/:token`
4. Handle both logged-in and non-logged-in invitation acceptance
5. Store pending invitation if user needs to sign in first

## Questions or Issues?

Contact the development team if you have questions about these requirements.

