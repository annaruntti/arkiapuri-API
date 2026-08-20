# Pentteriskannerin evaluation

Tämä harjotus mittaa, miten hyvin malli tunnistaa elintarvikkeita kuvasta.

## Fixtures

Laita 25 testikuvaa kansioon `images/` nimillä `01.jpg` … `25.jpg`.
Odotetut nimet ovat tiedostossa `expected.json`.

Kuva-aiheet on valittu niin, että eval paljastaa tyypilliset virheet:

- yksi tuote vs. täysi jääkaappi
- huono valaistus ja heijastukset
- osittain peittyneet pakkaukset
- kuiva-ainekaappi, pakastin, vihanneslaatikko
- kaukaa otettu kuva

Älä käytä kuvia, joissa näkyy ihmisiä.

## Ajo

Projektin juuresta (`arkiapuri-API`):

```bash
# Pelkkä normalisoija (ei vaadi kuvia eikä Gemini-avainta)
npm run eval:pantry-scan -- --normalizer-only

# Täysi eval (vaatii GEMINI_API_KEY ja images/*.jpg)
npm run eval:pantry-scan

# Vertaa Lite vs Flash
AI_EVAL_COMPARE_MODEL=gemini-3.5-flash npm run eval:pantry-scan
```

Kehityksessä avaa skannaus ilman Stripeä: `AI_GRANT_PREMIUM=true`.

## Mittarit

Precision = oikein tunnistetut / mallin palauttamat  
Recall = oikein tunnistetut / odotetut  

Nimet normalisoidaan samalla merge-keyllä kuin pentteri (`"Kevyt maito"` ≈ `"Kevytmaito"`).
