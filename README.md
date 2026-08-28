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

**Lägg först appen på hemskärmen.** Appen visar hur. Gör det innan du tar första
bilden — lagringen är skild mellan webbläsaren och en installerad app, så annars
laddas modellen ner två gånger. Det fungerar även utan, det blir bara en extra
nedladdning.

Sedan: **Ta foto** eller **Välj bild från telefonen**. Första gången hämtas
modellen, cirka 5 MB, sedan ligger den kvar. Maskeringen tar några sekunder —
fjorton genomsökningar körs över bilden, och räknaren visar hur långt den kommit.

När den är klar ser du den maskerade bilden och kan ladda ner den.

Under **Diagnostik** finns tekniska detaljer, versionsnummer, modellval och ett
självtest.

**Versionsnumret** står under Diagnostik. Från och med 2026-08-28.5 räcker en
vanlig omladdning för att få en ny version — appen hämtar sin egen kod från
nätet och använder cachen bara som reserv när nätet saknas. Modellen ligger kvar
cachad och laddas inte om.

**Fastnat på en gammal version?** Öppna Diagnostik och tryck **Nollställ
appen**. Den avregistrerar service workern, tömmer cachen och laddar om.
Modellen hämtas då om, cirka 5 MB.

Går inte ens det — appen är så gammal att knappen saknas — radera webbplatsdata
för `joacimwall.github.io` i webbläsarens inställningar, eller ta bort appen från
hemskärmen och lägg till den på nytt. Det gäller bara versioner före
2026-08-28.5.

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
- Trädstammar och djur maskeras ibland av misstag. Det är avsiktligt: tröskeln
  är satt lågt för att hellre maskera för mycket än missa en människa.
- iOS sparar inte alltid nedladdningen direkt; bilden kan öppnas i stället, och
  då får du långtrycka för att spara.

## Tredjepartslicenser

| Komponent | Licens |
|---|---|
| [onnxruntime-web](https://github.com/microsoft/onnxruntime) 1.29.0 | MIT — `vendor/LICENSE-onnxruntime.txt` |
| [D-FINE-N och -S](https://huggingface.co/ustc-community/dfine_n_coco) (COCO, int8 ONNX) | Apache-2.0 — `models/LICENSE-model.txt` |

Modellens ursprung och verifierade grafspecifikation: `models/SOURCE.txt`.

## Två modeller

Appen kör **D-FINE-N** som standard. **D-FINE-S** väljs med `?modell=s` i
adressen.

| | N (standard) | S |
|---|---|---|
| Nedladdning | 2,5 MB | 6,7 MB |
| Tid per foto på telefon | cirka 7 s | **cirka 21 s** |
| Falska områden på en bild utan personer | fler | **noll** |

S är träffsäkrare — den maskerar inte trädstammar och älgar, och den hittar
delvis skymda personer med god marginal. Men den är tre gånger långsammare i
webbläsaren, vilket gör den obrukbar i fält. Den finns med för att kunna
jämföras på riktiga bilder.

**Byt modell i appen:** öppna **Diagnostik** längst ned och välj i listan.
Appen laddas om, och första bytet till S hämtar 6,7 MB. Det går också att skriva
`?modell=s` i adressen.

Ser du att N maskerar för mycket i en viss bild — trädstammar, djur — prova
samma bild med S och jämför.

## För mätningar

`?matning=1` i adressen visar reglage för tröskel, utvidgning, storlekstak och
tiling, samt regionstatistik under resultatet. Standardläget kör den
konfiguration mätningarna landade i: tiling på, tröskel 0,12, inget storlekstak.

Ingen bundler, inget byggsteg, inga körtidsberoenden.
