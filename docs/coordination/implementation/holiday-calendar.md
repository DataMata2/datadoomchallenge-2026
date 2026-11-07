# Kazakhstan holiday calendar for October 2026

Research date: 2026-11-07. Scope: calendar classification for the CQA demo's separately assigned October 2026 timestamps, using `Asia/Almaty`. This is a research recommendation; no application code or dependency was changed.

## Verified dates and sources

Kazakhstan's official 2026 holiday list identifies Republic Day on **Sunday, 2026-10-25**, with the day off transferred to **Monday, 2026-10-26**. Its only October holiday entry is Republic Day. The page was updated on 2026-04-22. [Government holiday calendar](https://www.gov.kz/article/33969?lang=ru).

The official production calendar independently lists October 25 as Republic Day and the October 25 → October 26 transfer for both five-day and six-day workweeks. It distinguishes holidays from weekly days off; consequently, a holiday flag should not be inferred from whether an employee would work that day. [Government production calendar, updated 2026-05-29](https://www.gov.kz/article/16887?lang=en).

The Ministry of Trade and Integration documents the country's transition to UTC+5 from 2024-03-01, including Almaty. Use the named reporting zone rather than a historical UTC+6 assumption. [Ministry time-zone announcement](https://www.gov.kz/org/mti/press/news/details/688998?lang=ru).

## Calendar API and recommended filter meaning

The `holidays` package supports Kazakhstan as country code `KZ`, with public holidays as the default category. PyPI lists stable release **0.108**, dated 2026-11-02; this is a candidate dependency, not a tested project pin. [PyPI package and release history](https://pypi.org/project/holidays/0.108/).

Use the documented `country_holidays` API with country `KZ`, years covering the selected reporting dates, `observed=True`, and an explicit `language="en_US"`. It produces a date-keyed holiday mapping; membership provides the classification and the mapped value provides a display name. `observed=True` includes observed dates. The documentation warns that `observed=False` may not work for every country. Its `is_working_day` helper returns false for either a holiday or a weekend, so that helper does not implement the requested holiday-only predicate. [Official API reference](https://holidays.readthedocs.io/en/main/api/).

Kazakhstan's documented implementation inherits `ObservedHolidayBase`, defaults holiday names to Kazakh, and supports `en_US`, `kk`, and `uk`. It can label estimated Islamic holidays; that caveat is outside October's Republic Day case. [Kazakhstan calendar documentation](https://holidays.readthedocs.io/en/main/auto_gen_docs/kazakhstan/).

Recommended product interpretation:

- Convert the assigned demo timestamp to `Asia/Almaty`, then classify its local calendar date. Apply hour and ISO-weekday predicates to the same converted timestamp.
- `holiday=true`: include Kazakhstan public holiday dates **and their observed dates**. For October 2026 the exact expected date set is `{2026-10-25, 2026-10-26}`.
- `holiday=false`: exclude those dates. Ordinary Saturdays and Sundays remain eligible; a separate `weekdays` filter controls weekday selection.
- An omitted holiday filter places no holiday restriction. Combine supplied filters with AND.
- Expose calendar country, timezone, observed-date inclusion, dependency/version or explicit calendar version, and source URLs in filter/report metadata. Preserve original organizer timestamps and the separate demo scheduling provenance.

Suggested visible description: “Kazakhstan public holidays, including observed days; dates use Asia/Almaty. Ordinary weekends are controlled by weekday filters.”

These are proposed application semantics, not a claim about an individual employee's work schedule. The October expectations follow the two official calendars cited above.

## Exact acceptance cases and verification limits

Use one otherwise eligible fixture per date and assert the following holiday classifications. These are required implementation expectations, not results from executing `holidays` here.

| Local date | ISO weekday | Expected `holiday` | Purpose |
| --- | --- | --- | --- |
| 2026-10-18 | 7, Sunday | false | Ordinary Sunday remains eligible for `holiday=false` |
| 2026-10-19 | 1, Monday | false | Ordinary weekday |
| 2026-10-23 | 5, Friday | false | Before holiday weekend |
| 2026-10-24 | 6, Saturday | false | Ordinary Saturday is not a public holiday |
| 2026-10-25 | 7, Sunday | true | Republic Day's actual date remains classified |
| 2026-10-26 | 1, Monday | true | Observed day included |
| 2026-10-27 | 2, Tuesday | false | Day following observed holiday |

Assert the full October holiday-date set, rather than checking only October 25. Also assert: `holiday=true` plus ISO weekday 1 selects October 26; plus ISO weekday 7 selects October 25; `holiday=false` plus ISO weekday 7 retains October 18. Compare dates/booleans, not translated holiday-name strings.

| UTC instant | Expected Asia/Almaty local timestamp | Expected `holiday` |
| --- | --- | --- |
| 2026-10-24T18:59:59Z | 2026-10-24T23:59:59+05:00 | false |
| 2026-10-24T19:00:00Z | 2026-10-25T00:00:00+05:00 | true |
| 2026-10-26T18:59:59Z | 2026-10-26T23:59:59+05:00 | true |
| 2026-10-26T19:00:00Z | 2026-10-27T00:00:00+05:00 | false |

Weekdays and boundary conversions were checked locally with GNU `date`, using `TZ=Asia/Almaty` and each listed ISO input; all produced the values above. No holiday package was installed or executed. The implementing worker must validate these expectations against its pinned dependency and the application selector.

Not verified: full-year 2026 calendar correctness, other years, every exceptional government transfer, individual organizational workweeks, library behavior with `observed=False`, deployed runtime timezone-data freshness, or current application behavior. The Adilet law page could not be fetched; no legal interpretation relies on it. Only this research note was written; no application source, config, dataset, dependency, Git index, branch, or history was changed.
