interface FamilyInvitationOptions {
    to: string;
    inviterName: string;
    householdName: string;
    inviteLink: string;
    webInviteLink: string;
    invitationToken: string;
}
interface EmailResult {
    success: boolean;
    messageId?: string;
    message?: string;
    error?: string;
}
export declare const sendFamilyInvitation: ({ to, inviterName, householdName, inviteLink, webInviteLink, invitationToken, }: FamilyInvitationOptions) => Promise<EmailResult>;
export declare const testEmailConfiguration: () => Promise<EmailResult>;
export {};
//# sourceMappingURL=emailService.d.ts.map