# Sample Data

## LagBes (Warehouse Stock) — Apollo NTS export

**File:** `LagBes.csv` (or `.txt` — same format, either accepted)
**Delimiter:** `;` (semicolon)
**Encoding:** likely CP1252 / Windows-1252 (contains `ü`, `ö`, `ß`, `µ`)
**Date format:** `DD.MM.YY` (2-digit year — century inferred from context)
**Decimal separator:** `,` (comma) — **BUT see critical quirk below**

### CRITICAL DATA QUALITY ISSUE — decimal comma breaks CSV delimiting

The Apollo NTS export writes German decimal commas (`112,532`) **without quoting**,
but the CSV is semicolon-delimited. This means numeric fields containing a decimal
are split across **two columns** by the naive parser.

Example row fragment:
```
Preis;pro Menge;Wert;Abwert%;Wert mit Abw.
112;532;1;560;27;0;560;27
```
The real values are: Preis=`112,532`, pro Menge=`1`, Wert=`560,27`, Abwert%=`0`, Wert mit Abw.=`560,27`.

**Implication:** The parser cannot rely on fixed column positions. It must detect
number-with-decimal pairs based on the schema (known numeric columns) and re-merge them.
Alternatively: pre-process the file and convert `,` inside numeric fields to `.`.

### Column schema (abbreviated)

Key columns for KPIs:
- `Artikelnr` — article number (string; may contain letters, e.g. `H0001`, `K 7154`, `A 0011`)
- `Typ` — one of: `ART` (article), `MAT` (material), `HLB` (half-finished), `WKZ` (tool/sample)
- `Bezeichnung 1`..`Bezeichnung 6` — description lines (German + English mix)
- `WGR` — product group
- `ProdGrp` — production group
- `Lagername` — warehouse name (e.g. `HAUPTLAGER NEU`, `VERSANDLAGER`, `PRODUKTION ACM`, `MUSTERRAUM`)
- `Bestand (Lagereinheit)` — stock in storage unit (**can be negative** — corrections/reservations)
- `Lag Einh` — unit (`STK`, `QM`, `LFM`, `KON`, `ROL`, `YAR`, `SQF`, `SQY`, `LFM`, `KAR`, `PCK`, `PKL`, `PAL`, `FL`, `KG`, `L`, etc.)
- `Bestand (Basiseinheit)` — stock in base unit
- `Preis` — price per `pro Menge` units
- `pro Menge` — unit count the price refers to (often `1` but may be `1000` for small parts)
- `Wert` — inventory value (€)
- `Abwert%` — devaluation percentage
- `Wert mit Abw.` — value after devaluation
- `Durch.Verbr` — average consumption
- `Reichw.Mon.` — coverage in months
- `letzt.Zugang` — date of last receipt
- `Lagerzugang Dat` / `Lagerabgang Dat` — last inflow/outflow dates
- `Lagerabgang letzes Jahr` — outflow last year
- `Lagerabgang letzes 1/2 Jahr` — outflow last 6 months
- `Lagerzugang letzes 1/2 Jahr` — inflow last 6 months
- `Gelöscht` — deleted flag (`N` / `J`)
- `Erf.-Datum` — creation date
- `ABC-Kennz. VK` — ABC classification (A/B/C) from sales perspective

### Data characteristics

- **Thousands of rows** (file has 900+ rows in the sample alone)
- **Many dead-stock items** — `letzt.Zugang` dates back to 2001-2015
- **Mixed languages** in descriptions (German/English, sometimes both in one row)
- **Museum/sample items** (`Typ=WKZ`, description starting with `Rückstellmuster`) are zero-value stock kept for reference
- **Aerospace domain** — Airbus A350/A380, Diamond DA40/DA42 seat covers, mattresses, carpets
- **Special characters** in names (`µµµµ`, umlauts, accents)
- **Negative stock** in some rows — requires investigation before being treated as "out of stock"
