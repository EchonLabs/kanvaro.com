# Holiday seed data

CSV files in this directory are importable through the working-calendar holiday
import endpoint (spec CAL-10). Columns are fixed:

```
name,date,type,isFullDay,hoursIfPartial
```

- `date` — ISO `YYYY-MM-DD`, timezone independent
- `type` — `public` | `company` | `optional`
- `isFullDay` — `true` | `false`; when `false`, `hoursIfPartial` is required
- Import is **all or nothing**: if any row fails validation the whole file is
  rejected and the failing row numbers are reported

## Sri Lanka

Holiday sets are perpetual, not per-year: there is one `Sri Lanka Public
Holidays` set that gets topped up each year as the gazette is published.
Projects subscribe once, and the calendar screen warns when a sprint runs past
the last loaded date rather than silently treating an unloaded year as all
working days.

### Why these are data and not code

Most Sri Lankan holidays are lunar and cannot be computed:

- **Poya days** (full moon) shift ~11 days earlier each Gregorian year. There
  are usually 12, but **2026 has 13** because of the intercalary Adhi Poson on
  30 May — any "one full moon per month" assumption is wrong.
- **Islamic holidays** (Id Ul-Fitr, Id Ul-Alha, Milad un-Nabi) follow the Hijri
  calendar *and* are gazetted by moon sighting, so the official date can differ
  from the astronomical projection and can move at short notice.
- **Hindu and Christian** observances (Thai Pongal, Maha Shivarathri, Deepavali,
  Good Friday) shift year to year.

Only National/Independence Day (4 Feb), May Day (1 May), Sinhala & Tamil New
Year (13–14 Apr) and Christmas (25 Dec) are fixed.

### Note on `type`

Every row is seeded as `public`. In Sri Lanka the religious holidays listed here
are gazetted public holidays for the whole workforce under the Holidays Act
No. 29 of 1971 — they are not per-employee opt-ins, so `optional` would be the
wrong classification.

`optional` exists for genuinely per-member observances (CAL-9: the day stays a
working day, a stand-up still runs, and only observers' capacity is reduced).
Sri Lanka's Public / Bank / **Mercantile** distinction is not captured in these
files; if a team in the mercantile sector works a day that is Public+Bank only,
express that as a project-level calendar override rather than editing this set.

## Verification status

| File | Status |
|---|---|
| `sri-lanka-2026.csv` | Two independent sources agree on every date. Reasonably confident. |
| `sri-lanka-2027.csv` | **Two dates disputed between sources — verify against the gazette before relying on this year.** |

### Disputed 2027 dates

| Holiday | In this file | Alternative source | Notes |
|---|---|---|---|
| Medin Full Moon Poya Day | 2027-03-22 | 2027-03-21 | |
| Vesak Full Moon Poya Day | 2027-05-19 | 2027-05-20 | This file uses 05-19, which is internally consistent with "Day following Vesak" on 05-20. If Vesak is actually 05-20, the following day must move to 05-21. |

The values kept here come from the source that presented a complete 25-holiday
list declared under the Holidays Act, and that is self-consistent on the
Vesak pairing. They are still projections until checked against the published
gazette.

**Authoritative source:** the Government Gazette / Department of Government
Information calendar for the relevant year.

Sources consulted:
- https://publicholidays.lk/poya-day/
- https://publicholidays.lk/2026-dates/
- https://www.examresults.lk/sri-lanka-public-holidays-2027/
- https://www.gazette.lk/2025/12/2026-government-calendar-with-holidays-sri-lanka-public-bank-mercantile-full-moon-poya-holidays.html
