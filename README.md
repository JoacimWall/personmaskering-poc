# PoC personmaskering

Testversion. Maskerar personer i ett foto **direkt på telefonen**, innan bilden
kan sparas eller delas.

## Bilden lämnar aldrig enheten

Det finns ingen server, ingen uppladdning och ingen kö. Modellen körs i
webbläsaren, originalbilden släpps så snart den maskerade versionen är skapad,
och den maskerade filen sparas bara om du själv trycker på nedladdning.

All metadata tas bort ur utdatan: GPS-position, enhetsmodell, tidsstämpel och
den inbäddade miniatyrbild som annars visar originalet. Verifierat med
`exiftool` på 21 utdatafiler.

Maskeringen är **opak ifyllnad**, inte oskärpa eller pixelering. Oskärpa och
pixelering går att återvinna — en konstant svart yta gör det inte.

## Så testar du

Öppna länken i webbläsaren på telefonen.

1. Tryck **Ladda modell**. Cirka 5 MB hämtas första gången, sedan ligger den
   kvar i cachen.
2. Tryck **Starta kamera** och godkänn behörigheten.
3. Tryck **Ta foto och maskera**. Det tar några sekunder — 14 inferenser körs
   över bilden.
4. Tryck **Ladda ner maskad bild** om du vill spara den.

Vill du lägga appen på hemskärmen: gör det **innan** du laddar modellen. Lagringen
är isolerad mellan webbläsaren och en installerad app, annars hämtas modellen två
gånger.

**Självtest** kontrollerar att maskeringen och boxsammanslagningen fungerar.
Resultatet visas i statusraden.

## Inställningar

| Reglage | Vad det gör |
|---|---|
| Tröskel | Hur säker detektorn måste vara. Lägre hittar fler, maskerar mer. |
| Utvidgning | Marginal runt varje region. |
| Max regionstorlek | Kastar regioner över en viss andel av bilden. **Avstängt, och bör förbli det** — det kan skära sönder en verklig person. |
| Tiling | Delar bilden i rutor och kör detektorn på varje. Hittar personer långt bort, men tar cirka tio gånger längre tid. |

Under resultatet visas hur många regioner som maskerats, hur stor den största är
och hur lång tid det tog.

## Vad som är värt att rapportera

- **Personer som inte maskerades.** Det viktigaste. Notera avstånd och om de var
  delvis skymda.
- Bilder där för mycket svartmålades så motivet förstördes.
- Hur lång tid det tog, och på vilken telefonmodell.
- Om kameran behövde godkännas på nytt vid varje start.

Det här är ett mätinstrument, inte en tjänst. Syftet är att ta fram siffror för
ett beslut — inte att vara färdigt.

## Kända begränsningar

- Ingen artbestämning, ingen lagring, ingen uppladdning. Endast maskering.
- Detektorn tappar säkerhet på personer mindre än cirka 80 px i bilden.
- iOS sparar inte alltid nedladdningen direkt; bilden kan öppnas i stället, och
  då får du långtrycka för att spara.

## Tredjepartslicenser

| Komponent | Licens |
|---|---|
| [onnxruntime-web](https://github.com/microsoft/onnxruntime) 1.29.0 | MIT — `vendor/LICENSE-onnxruntime.txt` |
| [D-FINE-N](https://huggingface.co/ustc-community/dfine_n_coco) (COCO, int8 ONNX) | Apache-2.0 — `models/LICENSE-model.txt` |

Modellens ursprung och verifierade grafspecifikation: `models/SOURCE.txt`.

Ingen bundler, inget byggsteg, inga körtidsberoenden.
