import { completeStructured, pantryScanResponseSchema } from "../llmClient"
import { normalizePantryDetections } from "../productNormalizer"
import type {
  CatalogFoodMatch,
  ImageInput,
  NormalizedPantryCandidate,
  PantryScanModelOutput,
} from "../types"

export const PANTRY_SCAN_SYSTEM = `Olet Arkiapurin pentteriskanneri. Tunnistat elintarvikkeita jääkaapin, kuiva-ainekaapin tai keittiöhyllyn kuvasta.

Tavoite: listaa KAIKKI näkyvät elintarvikkeet, ei vain etualaa. Täydessä jääkaapissa on usein 20–40 erillistä tuotetta.

Säännöt:
- Käy hyllyt järjestelmällisesti: ylähylly → keskihyllyt → alahylly → vihanneslaatikot → ovihyllyt.
- Listaa myös taka-alalla, osittain peitossa tai pienellä etiketillä olevat tuotteet (matalampi confidence + notes).
- Sama tuote useassa paketissa: yksi rivi, quantityGuess = näkyvien pakkausten määrä.
- Käytä suomenkielisiä yleisnimiä (esim. "rasvaton maito", "kananmunat", "tomaatit").
- Brändi vain jos se on selvästi luettava ja erottaa tuotteen (esim. "Valio voi").
- Älä keksi tuotteita joita et näe. Älä listaa astioita, hyllyjä, magneetteja tai tyhjiä rasioita.
- Älä pysähdy ~10 tuotteeseen, jos kuvassa on enemmän.
- confidence 0–1.
- quantityGuess vain jos määrä on arvioitavissa, muuten 1.
- unit on yksi: kpl, g, kg, ml, dl, l.
- category on yksi: Maitotuotteet, Kasvikset, Liha, Kala, Kasviproteiinit, Kuiva-aineet, Juomat, Mausteet, Säilykkeet, Valmisateriat, Leivontatarvikkeet, Pakasteet.`

export const PANTRY_SCAN_USER =
  "Listaa jokainen kuvassa näkyvä elintarvike. Käy kaikki hyllyt ja ovihyllyt. Palauta JSON items-kentässä."

export const scanPantryImage = async (params: {
  image: ImageInput
  catalog?: CatalogFoodMatch[]
  pantryNames?: string[]
  model?: string
}): Promise<{
  items: NormalizedPantryCandidate[]
  model: string
  estimatedCostUsd: number
  inputTokens: number
  outputTokens: number
}> => {
  const result = await completeStructured<PantryScanModelOutput>({
    system: PANTRY_SCAN_SYSTEM,
    user: PANTRY_SCAN_USER,
    image: params.image,
    schema: pantryScanResponseSchema,
    model: params.model,
    maxOutputTokens: 8192,
  })

  const rawItems = Array.isArray(result.data?.items) ? result.data.items : []
  const items = normalizePantryDetections(
    rawItems,
    params.catalog || [],
    params.pantryNames || []
  )

  return {
    items,
    model: result.model,
    estimatedCostUsd: result.estimatedCostUsd,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  }
}
