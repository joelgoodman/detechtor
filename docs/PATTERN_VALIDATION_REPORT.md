# Pattern Validation Report

Generated: 2026-04-21  
Evidence snapshots: 81 across 35 technologies  
Patterns evaluated: 1247

## Summary

| Status | Count | % |
|--------|------:|--:|
| ✅ Verified | 90 | 7% |
| 🔍 Needs review (verified + FP hits) | 77 | 6% |
| ❓ Suspect (never fires) | 154 | 12% |
| ⚠️ False positive (fires only on wrong tech) | 9 | 1% |
| ⬜ No evidence captured | 917 | 74% |
| **Total** | **1247** | |

> **Suspect** patterns may be valid but untested — re-run after expanding the reference-site ledger.
> **Needs review** patterns fire on both correct and incorrect sites — inspect the FP hits in the ledger.

## higher-ed-cms.json

7 technologies · 46 patterns · 8 verified · 5 needs-review · 13 suspect · 0 false-positive · 20 no-evidence

| Technology | Total | Verified | Review | Suspect | FP | No Evidence |
|------------|------:|---------:|-------:|--------:|---:|------------:|
| Blackboard Web Community Manager | 4 | 0 | 0 | 0 | 0 | 4 |
| Cascade CMS | 4 | 0 | 0 | 0 | 0 | 4 |
| Finalsite | 4 | 0 | 0 | 0 | 0 | 4 |
| Ingeniux CMS | 4 | 0 | 0 | 0 | 0 | 4 |
| Modern Campus CMS | 17 | 5 | 4 | 8 | 0 | 0 |
| SchoolMessenger | 4 | 0 | 0 | 0 | 0 | 4 |
| TerminalFour | 9 | 3 | 1 | 5 | 0 | 0 |

### Patterns needing attention

- ❓ **Modern Campus CMS** `[html]` `omni-cms` — suspect
- ❓ **Modern Campus CMS** `[html]` `data-omni-` — suspect
- ❓ **Modern Campus CMS** `[html]` `omnicms\.omniupdate\.com` — suspect
- 🔍 **Modern Campus CMS** `[html]` `modern.*campus` — needs-review — _FP on: Mediasite_
- ❓ **Modern Campus CMS** `[scripts]` `omnicms` — suspect
- ❓ **Modern Campus CMS** `[scripts]` `omni\.js` — suspect
- ❓ **Modern Campus CMS** `[scripts]` `omniupdate` — suspect
- ❓ **Modern Campus CMS** `[scripts]` `moderncampus` — suspect
- ❓ **Modern Campus CMS** `[headers]` `X-Powered-By=OmniCMS` — suspect
- 🔍 **Modern Campus CMS** `[js]` `OmniCMS` — needs-review — _FP on: 25Live, 25Live +69_
- 🔍 **Modern Campus CMS** `[js]` `omni` — needs-review — _FP on: 25Live, 25Live +69_
- 🔍 **Modern Campus CMS** `[js]` `ModernCampus` — needs-review — _FP on: 25Live, 25Live +69_
- ❓ **TerminalFour** `[html]` `t4-content` — suspect
- ❓ **TerminalFour** `[html]` `t4-tag` — suspect
- ❓ **TerminalFour** `[html]` `data-t4-` — suspect
- ❓ **TerminalFour** `[scripts]` `terminalfour` — suspect
- ❓ **TerminalFour** `[meta]` `generator=T4|TerminalFour` — suspect
- 🔍 **TerminalFour** `[js]` `TerminalFour` — needs-review — _FP on: 25Live, 25Live +66_

## higher-ed-infra.json

112 technologies · 589 patterns · 48 verified · 49 needs-review · 81 suspect · 9 false-positive · 402 no-evidence

| Technology | Total | Verified | Review | Suspect | FP | No Evidence |
|------------|------:|---------:|-------:|--------:|---:|------------:|
| 25Live | 10 | 5 | 2 | 3 | 0 | 0 |
| Academic Works | 5 | 3 | 1 | 1 | 0 | 0 |
| AdAstra | 4 | 0 | 0 | 0 | 0 | 4 |
| AddSearch | 3 | 0 | 0 | 0 | 0 | 3 |
| Adobe Creative Cloud | 6 | 0 | 0 | 0 | 0 | 6 |
| Adobe Experience Manager Assets | 6 | 0 | 0 | 0 | 0 | 6 |
| AdvancementForm | 3 | 0 | 0 | 0 | 0 | 3 |
| AdvisorTrac | 4 | 0 | 0 | 0 | 0 | 4 |
| AlertMedia | 3 | 0 | 0 | 0 | 0 | 3 |
| Algolia | 5 | 0 | 0 | 0 | 0 | 5 |
| Almabase | 3 | 2 | 0 | 1 | 0 | 0 |
| Anthology Encompass | 7 | 0 | 0 | 0 | 0 | 7 |
| Anthology Engage | 11 | 3 | 4 | 3 | 1 | 0 |
| AppArmor | 3 | 0 | 0 | 0 | 0 | 3 |
| Argos | 4 | 0 | 0 | 0 | 0 | 4 |
| Azure Cognitive Search | 4 | 0 | 0 | 0 | 0 | 4 |
| Blackbaud | 3 | 0 | 0 | 0 | 0 | 3 |
| Brandfolder | 3 | 0 | 0 | 0 | 0 | 3 |
| BrightSign | 3 | 0 | 0 | 0 | 0 | 3 |
| Brightcove | 4 | 0 | 0 | 0 | 0 | 4 |
| Bynder | 3 | 0 | 0 | 0 | 0 | 3 |
| CAS | 7 | 5 | 1 | 1 | 0 | 0 |
| CBORD | 9 | 3 | 2 | 4 | 0 | 0 |
| Canto | 4 | 0 | 0 | 0 | 0 | 4 |
| Canva for Education | 4 | 0 | 0 | 0 | 0 | 4 |
| Civitas Learning | 4 | 4 | 0 | 0 | 0 | 0 |
| Cludo | 3 | 0 | 0 | 0 | 0 | 3 |
| Concept3D | 3 | 0 | 0 | 0 | 0 | 3 |
| Coveo | 3 | 0 | 0 | 0 | 0 | 3 |
| Destiny One | 4 | 0 | 0 | 0 | 0 | 4 |
| Duo Security | 6 | 0 | 0 | 0 | 0 | 6 |
| EAB Navigate | 8 | 2 | 3 | 3 | 0 | 0 |
| EBSCO Discovery Service | 6 | 0 | 0 | 0 | 0 | 6 |
| EMS | 5 | 0 | 0 | 0 | 0 | 5 |
| Echo360 | 4 | 0 | 0 | 0 | 0 | 4 |
| Elasticsearch | 5 | 0 | 0 | 0 | 0 | 5 |
| Element451 Search | 3 | 0 | 3 | 0 | 0 | 0 |
| Element451 | 7 | 0 | 2 | 4 | 1 | 0 |
| Encoura | 4 | 0 | 0 | 0 | 0 | 4 |
| Ensemble Video | 4 | 0 | 0 | 0 | 0 | 4 |
| Everbridge | 3 | 0 | 0 | 0 | 0 | 3 |
| Ex Libris Alma | 7 | 1 | 3 | 3 | 0 | 0 |
| Ex Libris Primo | 10 | 0 | 4 | 3 | 3 | 0 |
| Ex Libris Voyager | 5 | 0 | 0 | 0 | 0 | 5 |
| FOLIO LSP | 4 | 0 | 0 | 0 | 0 | 4 |
| Figma for Education | 3 | 0 | 0 | 0 | 0 | 3 |
| Flipgrid | 4 | 0 | 0 | 0 | 0 | 4 |
| Four Winds Interactive | 6 | 0 | 0 | 0 | 0 | 6 |
| Funnelback | 5 | 0 | 0 | 0 | 0 | 5 |
| GIS Cloud | 4 | 0 | 0 | 0 | 0 | 4 |
| Google Custom Search | 6 | 0 | 0 | 0 | 0 | 6 |
| Google Workspace | 7 | 0 | 0 | 0 | 0 | 7 |
| GradesFirst | 4 | 0 | 0 | 0 | 0 | 4 |
| Graduway | 3 | 0 | 0 | 0 | 0 | 3 |
| HelioCampus | 3 | 0 | 0 | 0 | 0 | 3 |
| Hobsons Connect | 3 | 0 | 0 | 0 | 0 | 3 |
| HubSpot for Education | 10 | 0 | 0 | 0 | 0 | 10 |
| InCommon Federation | 3 | 0 | 0 | 0 | 0 | 3 |
| Informer | 5 | 0 | 0 | 0 | 0 | 5 |
| Infosilem | 3 | 0 | 0 | 0 | 0 | 3 |
| Innovative Interfaces Sierra | 6 | 0 | 0 | 0 | 0 | 6 |
| JW Player | 5 | 0 | 0 | 0 | 0 | 5 |
| Jibestream | 3 | 0 | 0 | 0 | 0 | 3 |
| Kaltura | 12 | 5 | 2 | 5 | 0 | 0 |
| Kognito | 3 | 0 | 0 | 0 | 0 | 3 |
| Koha ILS | 4 | 0 | 0 | 0 | 0 | 4 |
| LibAnswers | 4 | 0 | 0 | 0 | 0 | 4 |
| LibCal | 4 | 0 | 0 | 0 | 0 | 4 |
| LibGuides | 6 | 0 | 0 | 0 | 0 | 6 |
| LiveSafe | 3 | 0 | 0 | 0 | 0 | 3 |
| Localist | 7 | 1 | 4 | 2 | 0 | 0 |
| Lucidworks Fusion | 5 | 0 | 0 | 0 | 0 | 5 |
| MapYourTag | 3 | 0 | 0 | 0 | 0 | 3 |
| Mappedin | 3 | 0 | 0 | 0 | 0 | 3 |
| Mediasite | 7 | 3 | 0 | 4 | 0 | 0 |
| Meilisearch | 6 | 0 | 0 | 0 | 0 | 6 |
| Microsoft Power BI | 4 | 0 | 0 | 0 | 0 | 4 |
| Mindmax | 3 | 0 | 0 | 0 | 0 | 3 |
| NoviSign | 3 | 0 | 0 | 0 | 0 | 3 |
| OCLC WorldShare | 6 | 0 | 0 | 0 | 0 | 6 |
| Okta | 3 | 0 | 0 | 0 | 0 | 3 |
| Panopto | 8 | 2 | 3 | 3 | 0 | 0 |
| Polaris ILS | 4 | 0 | 0 | 0 | 0 | 4 |
| Qualtrics | 10 | 1 | 2 | 6 | 1 | 0 |
| Raiser's Edge | 4 | 0 | 0 | 0 | 0 | 4 |
| Rave Mobile Safety | 6 | 0 | 0 | 0 | 0 | 6 |
| Ready Education | 4 | 0 | 0 | 0 | 0 | 4 |
| Rise Vision | 4 | 0 | 0 | 0 | 0 | 4 |
| SAML | 5 | 0 | 0 | 0 | 0 | 5 |
| Sajari | 3 | 0 | 0 | 0 | 0 | 3 |
| Salesforce Education Cloud | 16 | 0 | 0 | 0 | 0 | 16 |
| Scala Digital Signage | 4 | 0 | 0 | 0 | 0 | 4 |
| ScreenCloud | 3 | 0 | 0 | 0 | 0 | 3 |
| Screencast-O-Matic | 4 | 0 | 0 | 0 | 0 | 4 |
| SearchBlox | 3 | 0 | 0 | 0 | 0 | 3 |
| Shibboleth | 10 | 0 | 2 | 7 | 1 | 0 |
| SirsiDynix Symphony | 6 | 0 | 0 | 0 | 0 | 6 |
| Site Search 360 | 4 | 0 | 0 | 0 | 0 | 4 |
| Slate | 18 | 3 | 6 | 9 | 0 | 0 |
| Starfish | 7 | 0 | 0 | 0 | 0 | 7 |
| Summon | 4 | 0 | 0 | 0 | 0 | 4 |
| Swiftype | 4 | 0 | 0 | 0 | 0 | 4 |
| TouchNet | 15 | 3 | 3 | 8 | 1 | 0 |
| Transact Campus | 16 | 2 | 2 | 11 | 1 | 0 |
| VidGrid | 3 | 0 | 0 | 0 | 0 | 3 |
| Vimeo | 6 | 0 | 0 | 0 | 0 | 6 |
| Widen Collective | 5 | 0 | 0 | 0 | 0 | 5 |
| Wistia | 4 | 0 | 0 | 0 | 0 | 4 |
| WorldCat Discovery | 5 | 0 | 0 | 0 | 0 | 5 |
| YouTube | 9 | 0 | 0 | 0 | 0 | 9 |
| YuJa | 4 | 0 | 0 | 0 | 0 | 4 |
| Zimbra | 3 | 0 | 0 | 0 | 0 | 3 |

### Patterns needing attention

- 🔍 **25Live** `[html]` `event.*management` — needs-review — _FP on: Academic Works, Academic Works +7_
- ❓ **25Live** `[html]` `twentyfivelive` — suspect
- ❓ **25Live** `[html]` `class=25live` — suspect
- ❓ **25Live** `[scripts]` `twentyfivelive` — suspect
- 🔍 **25Live** `[js]` `TwentyFiveLive` — needs-review — _FP on: Academic Works, Academic Works +68_
- 🔍 **Academic Works** `[html]` `academic.*works` — needs-review — _FP on: Civitas Learning, EAB Navigate +2_
- ❓ **Academic Works** `[scripts]` `academicworks` — suspect
- ❓ **Almabase** `[scripts]` `almabase` — suspect
- ❓ **CAS** `[scripts]` `apereo.*cas` — suspect
- 🔍 **CAS** `[js]` `CAS` — needs-review — _FP on: 25Live, 25Live +68_
- 🔍 **CBORD** `[html]` `campus.*dining` — needs-review — _FP on: Ellucian Colleague, Jenzabar_
- ❓ **CBORD** `[html]` `getcbord` — suspect
- ❓ **CBORD** `[html]` `cs\.cbord\.com` — suspect
- ❓ **CBORD** `[html]` `mycard\.cbord\.com` — suspect
- ❓ **CBORD** `[html]` `class=cbord` — suspect
- 🔍 **CBORD** `[js]` `CBORD` — needs-review — _FP on: 25Live, 25Live +67_
- 🔍 **EAB Navigate** `[html]` `campus.eab.com` — needs-review — _FP on: Academic Works, Anthology Student_
- 🔍 **EAB Navigate** `[html]` `eab.*navigate` — needs-review — _FP on: Academic Works, Academic Works +1_
- ❓ **EAB Navigate** `[scripts]` `campus.eab.com` — suspect
- ❓ **EAB Navigate** `[scripts]` `bouncer.eab.com` — suspect
- ❓ **EAB Navigate** `[cookies]` `_campus_session` — suspect
- 🔍 **EAB Navigate** `[js]` `EAB` — needs-review — _FP on: 25Live, 25Live +68_
- ❓ **Element451** `[html]` `element451` — suspect
- 🔍 **Element451** `[html]` `shell.451.io` — needs-review — _FP on: AwardSpring, Element451 Search_
- ❓ **Element451** `[html]` `id=shell451` — suspect
- ⚠️ **Element451** `[scripts]` `shell.451.io` — false-positive — _FP on: AwardSpring_
- ❓ **Element451** `[scripts]` `element451` — suspect
- 🔍 **Element451** `[js]` `Shell451` — needs-review — _FP on: AwardSpring, Element451 Search_
- ❓ **Element451** `[js]` `Element451` — suspect
- 🔍 **Element451 Search** `[html]` `BoltDiscovery` — needs-review — _FP on: Element451_
- 🔍 **Element451 Search** `[html]` `bolt.*discovery` — needs-review — _FP on: Element451_
- 🔍 **Element451 Search** `[js]` `BoltDiscovery` — needs-review — _FP on: Element451_
- ❓ **Ex Libris Alma** `[html]` `alma.*exlibris` — suspect
- ❓ **Ex Libris Alma** `[html]` `exlibris.*alma` — suspect
- 🔍 **Ex Libris Alma** `[scripts]` `exlibrisgroup` — needs-review — _FP on: Ex Libris Primo, Ex Libris Primo_
- ❓ **Ex Libris Alma** `[scripts]` `exlibris.*alma` — suspect
- 🔍 **Ex Libris Alma** `[js]` `ExLibris` — needs-review — _FP on: 25Live, 25Live +69_
- 🔍 **Ex Libris Alma** `[js]` `Alma` — needs-review — _FP on: 25Live, 25Live +69_
- ⚠️ **Ex Libris Primo** `[html]` `primo.*exlibris` — false-positive — _FP on: Ex Libris Alma, Ex Libris Alma_
- ⚠️ **Ex Libris Primo** `[html]` `exlibris.*primo` — false-positive — _FP on: Ex Libris Alma, Ex Libris Alma_
- 🔍 **Ex Libris Primo** `[html]` `primo.*ve` — needs-review — _FP on: Ex Libris Alma, Ex Libris Alma_
- ❓ **Ex Libris Primo** `[html]` `/primo-explore/` — suspect
- ⚠️ **Ex Libris Primo** `[html]` `primo.exlibrisgroup.com` — false-positive — _FP on: Ex Libris Alma, Ex Libris Alma_
- ❓ **Ex Libris Primo** `[scripts]` `exlibris.*primo` — suspect
- 🔍 **Ex Libris Primo** `[scripts]` `primo\.exlibris` — needs-review — _FP on: Ex Libris Alma, Ex Libris Alma_
- 🔍 **Ex Libris Primo** `[scripts]` `primo.exlibrisgroup.com` — needs-review — _FP on: Ex Libris Alma, Ex Libris Alma_
- 🔍 **Ex Libris Primo** `[js]` `Primo` — needs-review — _FP on: 25Live, 25Live +68_
- ❓ **Ex Libris Primo** `[js]` `PrimoVE` — suspect
- ❓ **Kaltura** `[html]` `kwidget` — suspect
- ❓ **Kaltura** `[html]` `cdnapi\.kaltura\.com` — suspect
- ❓ **Kaltura** `[html]` `html5player\.kaltura\.com` — suspect
- ❓ **Kaltura** `[scripts]` `kwidget` — suspect
- 🔍 **Kaltura** `[js]` `kWidget` — needs-review — _FP on: 25Live, 25Live +68_
- ❓ **Kaltura** `[js]` `KalturaPlayer` — suspect
- 🔍 **Kaltura** `[js]` `kaltura` — needs-review — _FP on: 25Live, 25Live +68_
- 🔍 **Localist** `[html]` `localist` — needs-review — _FP on: Workday Student_
- 🔍 **Localist** `[html]` `event.*calendar` — needs-review — _FP on: 25Live, Academic Works +12_
- ❓ **Localist** `[html]` `events\.localist\.com` — suspect
- ❓ **Localist** `[html]` `class=localist` — suspect
- 🔍 **Localist** `[scripts]` `localist` — needs-review — _FP on: Workday Student_
- 🔍 **Localist** `[js]` `Localist` — needs-review — _FP on: 25Live, 25Live +70_
- ❓ **Mediasite** `[html]` `sonicfoundry.*mediasite` — suspect
- ❓ **Mediasite** `[html]` `mediasite\.cloud` — suspect
- ❓ **Mediasite** `[html]` `class=mediasite` — suspect
- ❓ **Mediasite** `[scripts]` `mediasite` — suspect
- 🔍 **Panopto** `[html]` `panopto` — needs-review — _FP on: CAS, SITS_
- 🔍 **Panopto** `[html]` `panopto.*viewer` — needs-review — _FP on: SITS_
- ❓ **Panopto** `[html]` `class=panopto` — suspect
- ❓ **Panopto** `[scripts]` `hosted\.panopto\.com` — suspect
- ❓ **Panopto** `[scripts]` `panopto` — suspect
- 🔍 **Panopto** `[js]` `Panopto` — needs-review — _FP on: 25Live, 25Live +70_
- 🔍 **Shibboleth** `[html]` `shibboleth` — needs-review — _FP on: Academic Works, Academic Works +3_
- ❓ **Shibboleth** `[html]` `shibd` — suspect
- ⚠️ **Shibboleth** `[html]` `shib.*session` — false-positive — _FP on: Academic Works, Academic Works +2_
- ❓ **Shibboleth** `[html]` `idp\.shibboleth\.org` — suspect
- ❓ **Shibboleth** `[html]` `Shibboleth\.sso` — suspect
- ❓ **Shibboleth** `[html]` `class=shibboleth` — suspect
- ❓ **Shibboleth** `[scripts]` `shibboleth` — suspect
- ❓ **Shibboleth** `[headers]` `shib-session-id=.*` — suspect
- ❓ **Shibboleth** `[headers]` `shib-identity-provider=.*` — suspect
- 🔍 **Shibboleth** `[js]` `Shibboleth` — needs-review — _FP on: 25Live, 25Live +69_
- ❓ **Slate** `[html]` `slate\.technolutions\.com` — suspect
- ❓ **Slate** `[html]` `class=slate-` — suspect
- ❓ **Slate** `[html]` `id=slate-` — suspect
- ❓ **Slate** `[html]` `data-slate-` — suspect
- 🔍 **Slate** `[html]` `technolutions` — needs-review — _FP on: AwardSpring, Ellucian Colleague +2_
- ❓ **Slate** `[html]` `window[.ping_` — suspect
- 🔍 **Slate** `[html]` `mx.technolutions.net` — needs-review — _FP on: AwardSpring, Ellucian Colleague +2_
- ❓ **Slate** `[scripts]` `slate\.js` — suspect
- 🔍 **Slate** `[scripts]` `technolutions` — needs-review — _FP on: AwardSpring, Ellucian Colleague +2_
- 🔍 **Slate** `[scripts]` `mx.technolutions.net` — needs-review — _FP on: AwardSpring, Ellucian Colleague +2_
- ❓ **Slate** `[scripts]` `/ping?id=` — suspect
- ❓ **Slate** `[headers]` `x-slate-instance=.*` — suspect
- ❓ **Slate** `[meta]` `application-name=Slate` — suspect
- 🔍 **Slate** `[js]` `Slate` — needs-review — _FP on: Ellucian Colleague, Kaltura +2_
- 🔍 **Slate** `[js]` `Technolutions` — needs-review — _FP on: AwardSpring, Ellucian Colleague +2_
- 🔍 **TouchNet** `[html]` `touchnet` — needs-review — _FP on: Anthology Student_
- ⚠️ **TouchNet** `[html]` `upay` — false-positive — _FP on: Anthology Engage, CBORD +1_
- ❓ **TouchNet** `[html]` `ucommerce` — suspect
- ❓ **TouchNet** `[html]` `tnet-` — suspect
- ❓ **TouchNet** `[html]` `marketplace\.touchnet\.com` — suspect
- 🔍 **TouchNet** `[html]` `secure\.touchnet\.net` — needs-review — _FP on: Anthology Student_
- ❓ **TouchNet** `[html]` `class=tnet` — suspect
- ❓ **TouchNet** `[html]` `id=tnet` — suspect
- ❓ **TouchNet** `[scripts]` `touchnet` — suspect
- ❓ **TouchNet** `[scripts]` `upay` — suspect
- ❓ **TouchNet** `[scripts]` `tnet` — suspect
- 🔍 **TouchNet** `[js]` `TouchNet` — needs-review — _FP on: 25Live, 25Live +71_
- ❓ **Transact Campus** `[html]` `transactcampus\.com` — suspect
- ❓ **Transact Campus** `[html]` `blackboard.*transact` — suspect
- ⚠️ **Transact Campus** `[html]` `bb.*transact` — false-positive — _FP on: Academic Works, Element451 +1_
- ❓ **Transact Campus** `[html]` `transactcampus` — suspect
- ❓ **Transact Campus** `[html]` `transact-campus` — suspect
- ❓ **Transact Campus** `[html]` `transact\.com` — suspect
- ❓ **Transact Campus** `[html]` `campus\.transact\.com` — suspect
- ❓ **Transact Campus** `[html]` `class=transact` — suspect
- ❓ **Transact Campus** `[html]` `data-transact` — suspect
- ❓ **Transact Campus** `[scripts]` `bb.*transact` — suspect
- ❓ **Transact Campus** `[scripts]` `transact-campus` — suspect
- ❓ **Transact Campus** `[meta]` `generator=Transact` — suspect
- 🔍 **Transact Campus** `[js]` `Transact` — needs-review — _FP on: 25Live, 25Live +70_
- 🔍 **Transact Campus** `[js]` `BBTransact` — needs-review — _FP on: 25Live, 25Live +70_
- 🔍 **Anthology Engage** `[html]` `campuslabs\.com/engage` — needs-review — _FP on: Anthology Student_
- 🔍 **Anthology Engage** `[html]` `campus.*labs` — needs-review — _FP on: Anthology Student, Anthology Student +2_
- 🔍 **Anthology Engage** `[html]` `campuslabs` — needs-review — _FP on: Anthology Student, Anthology Student_
- ⚠️ **Anthology Engage** `[html]` `anthology.*engage` — false-positive — _FP on: Almabase_
- ❓ **Anthology Engage** `[html]` `engage.anthology` — suspect
- ❓ **Anthology Engage** `[scripts]` `anthology.*engage` — suspect
- 🔍 **Anthology Engage** `[js]` `CampusLabs` — needs-review — _FP on: Anthology Student, Anthology Student_
- ❓ **Anthology Engage** `[js]` `AnthologyEngage` — suspect
- 🔍 **Qualtrics** `[html]` `qualtrics.com` — needs-review — _FP on: AwardSpring_
- ⚠️ **Qualtrics** `[html]` `jfe/form/` — false-positive — _FP on: AwardSpring_
- ❓ **Qualtrics** `[html]` `QSI.API` — suspect
- ❓ **Qualtrics** `[html]` `zn[a-z0-9]+.siteintercept.qualtrics.com` — suspect
- ❓ **Qualtrics** `[scripts]` `qualtrics.com` — suspect
- ❓ **Qualtrics** `[scripts]` `siteintercept.qualtrics.com` — suspect
- ❓ **Qualtrics** `[scripts]` `survey.qualtrics.com` — suspect
- ❓ **Qualtrics** `[js]` `QSI` — suspect
- 🔍 **Qualtrics** `[js]` `Qualtrics` — needs-review — _FP on: AwardSpring, CAS_

## higher-ed-lms.json

54 technologies · 312 patterns · 8 verified · 7 needs-review · 21 suspect · 0 false-positive · 276 no-evidence

| Technology | Total | Verified | Review | Suspect | FP | No Evidence |
|------------|------:|---------:|-------:|--------:|---:|------------:|
| Absorb LMS | 4 | 0 | 0 | 0 | 0 | 4 |
| Blackboard Collaborate | 7 | 0 | 0 | 0 | 0 | 7 |
| Blackboard Learn | 14 | 0 | 0 | 0 | 0 | 14 |
| Blackboard Ultra | 7 | 0 | 0 | 0 | 0 | 7 |
| Brightspace Core | 4 | 0 | 0 | 4 | 0 | 0 |
| Brightspace Portfolio | 7 | 4 | 0 | 3 | 0 | 0 |
| Cambridge Core | 5 | 0 | 0 | 0 | 0 | 5 |
| Canvas LMS | 11 | 0 | 0 | 0 | 0 | 11 |
| Cengage MindTap | 7 | 0 | 0 | 0 | 0 | 7 |
| Cengage WebAssign | 7 | 0 | 0 | 0 | 0 | 7 |
| Cornerstone OnDemand | 6 | 0 | 0 | 0 | 0 | 6 |
| Coursera for Campus | 4 | 0 | 0 | 0 | 0 | 4 |
| D2L Brightspace | 13 | 0 | 7 | 6 | 0 | 0 |
| Docebo | 3 | 0 | 0 | 0 | 0 | 3 |
| Edmodo | 3 | 0 | 0 | 0 | 0 | 3 |
| ExamSoft | 3 | 0 | 0 | 0 | 0 | 3 |
| FutureLearn | 3 | 0 | 0 | 0 | 0 | 3 |
| Google Classroom | 5 | 0 | 0 | 0 | 0 | 5 |
| Honorlock | 3 | 0 | 0 | 0 | 0 | 3 |
| Instructure Canvas Catalog | 12 | 4 | 0 | 8 | 0 | 0 |
| Kahoot! | 3 | 0 | 0 | 0 | 0 | 3 |
| LearnDash | 4 | 0 | 0 | 0 | 0 | 4 |
| MATLAB Grader | 7 | 0 | 0 | 0 | 0 | 7 |
| Macmillan Achieve | 7 | 0 | 0 | 0 | 0 | 7 |
| McGraw-Hill ALEKS | 5 | 0 | 0 | 0 | 0 | 5 |
| McGraw-Hill Connect | 8 | 0 | 0 | 0 | 0 | 8 |
| Mentimeter | 4 | 0 | 0 | 0 | 0 | 4 |
| Microsoft Teams for Education | 7 | 0 | 0 | 0 | 0 | 7 |
| Moodle | 9 | 0 | 0 | 0 | 0 | 9 |
| MyMathLab | 6 | 0 | 0 | 0 | 0 | 6 |
| Nearpod | 4 | 0 | 0 | 0 | 0 | 4 |
| Norton Illumine | 7 | 0 | 0 | 0 | 0 | 7 |
| Open edX | 7 | 0 | 0 | 0 | 0 | 7 |
| Oxford Learning Link | 7 | 0 | 0 | 0 | 0 | 7 |
| Padlet | 3 | 0 | 0 | 0 | 0 | 3 |
| Pearson MyLab | 9 | 0 | 0 | 0 | 0 | 9 |
| Perusall | 3 | 0 | 0 | 0 | 0 | 3 |
| Poll Everywhere | 5 | 0 | 0 | 0 | 0 | 5 |
| ProctorU | 3 | 0 | 0 | 0 | 0 | 3 |
| Proctorio | 3 | 0 | 0 | 0 | 0 | 3 |
| Respondus LockDown Browser | 6 | 0 | 0 | 0 | 0 | 6 |
| Revel | 6 | 0 | 0 | 0 | 0 | 6 |
| SafeAssign | 4 | 0 | 0 | 0 | 0 | 4 |
| Sakai | 9 | 0 | 0 | 0 | 0 | 9 |
| Schoology | 4 | 0 | 0 | 0 | 0 | 4 |
| TalentLMS | 3 | 0 | 0 | 0 | 0 | 3 |
| Top Hat | 7 | 0 | 0 | 0 | 0 | 7 |
| Totara Learn | 4 | 0 | 0 | 0 | 0 | 4 |
| Turnitin | 3 | 0 | 0 | 0 | 0 | 3 |
| Unicheck | 3 | 0 | 0 | 0 | 0 | 3 |
| VeriCite | 3 | 0 | 0 | 0 | 0 | 3 |
| VitalSource Bookshelf | 7 | 0 | 0 | 0 | 0 | 7 |
| WileyPLUS | 7 | 0 | 0 | 0 | 0 | 7 |
| iClicker | 7 | 0 | 0 | 0 | 0 | 7 |

### Patterns needing attention

- ❓ **Brightspace Core** `[html]` `brightspace.*core` — suspect
- ❓ **Brightspace Core** `[html]` `valence.*api` — suspect
- ❓ **Brightspace Core** `[scripts]` `brightspace.*core` — suspect
- ❓ **Brightspace Core** `[js]` `BrightspaceCore` — suspect
- ❓ **Brightspace Portfolio** `[html]` `competency.*brightspace` — suspect
- ❓ **Brightspace Portfolio** `[js]` `BrightspacePortfolio` — suspect
- ❓ **Brightspace Portfolio** `[js]` `D2LPortfolio` — suspect
- 🔍 **D2L Brightspace** `[html]` `d2l\.com` — needs-review — _FP on: Brightspace Core_
- 🔍 **D2L Brightspace** `[html]` `brightspace` — needs-review — _FP on: Brightspace Core, Brightspace Portfolio +2_
- ❓ **D2L Brightspace** `[html]` `desire2learn` — suspect
- ❓ **D2L Brightspace** `[html]` `d2lbook` — suspect
- 🔍 **D2L Brightspace** `[html]` `d2l.*brightspace` — needs-review — _FP on: Brightspace Core, Brightspace Portfolio +1_
- ❓ **D2L Brightspace** `[scripts]` `d2l\.com` — suspect
- 🔍 **D2L Brightspace** `[scripts]` `brightspace` — needs-review — _FP on: Brightspace Core, Brightspace Portfolio_
- ❓ **D2L Brightspace** `[scripts]` `valence` — suspect
- ❓ **D2L Brightspace** `[scripts]` `desire2learn` — suspect
- ❓ **D2L Brightspace** `[headers]` `x-d2l-version=.*` — suspect
- 🔍 **D2L Brightspace** `[js]` `D2L` — needs-review — _FP on: 25Live, 25Live +69_
- 🔍 **D2L Brightspace** `[js]` `Brightspace` — needs-review — _FP on: Brightspace Core, Brightspace Portfolio +2_
- 🔍 **D2L Brightspace** `[js]` `Valence` — needs-review — _FP on: Brightspace Core_
- ❓ **Instructure Canvas Catalog** `[html]` `catalog\.instructure` — suspect
- ❓ **Instructure Canvas Catalog** `[html]` `catalog\.instructure\.com` — suspect
- ❓ **Instructure Canvas Catalog** `[scripts]` `\.catalog\.canvaslms\.com` — suspect
- ❓ **Instructure Canvas Catalog** `[scripts]` `catalog\.canvaslms\.com` — suspect
- ❓ **Instructure Canvas Catalog** `[scripts]` `canvas.*catalog` — suspect
- ❓ **Instructure Canvas Catalog** `[scripts]` `/canvas-catalog/` — suspect
- ❓ **Instructure Canvas Catalog** `[scripts]` `catalog\.instructure\.com` — suspect
- ❓ **Instructure Canvas Catalog** `[js]` `CanvasCatalog` — suspect

## higher-ed-sis.json

50 technologies · 300 patterns · 26 verified · 16 needs-review · 39 suspect · 0 false-positive · 219 no-evidence

| Technology | Total | Verified | Review | Suspect | FP | No Evidence |
|------------|------:|---------:|-------:|--------:|---:|------------:|
| Acalog | 3 | 0 | 0 | 0 | 0 | 3 |
| Anthology Student | 17 | 2 | 2 | 13 | 0 | 0 |
| ApplyTexas | 3 | 0 | 0 | 0 | 0 | 3 |
| AwardSpring | 3 | 2 | 0 | 1 | 0 | 0 |
| Campus Management Suite | 7 | 0 | 0 | 0 | 0 | 7 |
| CampusLogic | 4 | 0 | 0 | 0 | 0 | 4 |
| CampusVue | 8 | 0 | 0 | 0 | 0 | 8 |
| Coalition Application | 4 | 0 | 0 | 0 | 0 | 4 |
| Common Application | 4 | 0 | 0 | 0 | 0 | 4 |
| CourseLeaf | 3 | 0 | 0 | 0 | 0 | 3 |
| CurricUNET | 3 | 0 | 0 | 0 | 0 | 3 |
| Curriculog | 3 | 0 | 0 | 0 | 0 | 3 |
| DegreeWorks | 4 | 0 | 0 | 0 | 0 | 4 |
| Ellucian Banner | 14 | 0 | 0 | 0 | 0 | 14 |
| Ellucian Colleague | 10 | 4 | 2 | 4 | 0 | 0 |
| Evisions | 3 | 0 | 0 | 0 | 0 | 3 |
| FACTS SIS | 7 | 0 | 0 | 0 | 0 | 7 |
| FAST Financial Aid | 4 | 0 | 0 | 0 | 0 | 4 |
| Focus School Software | 7 | 0 | 0 | 0 | 0 | 7 |
| Gradelink | 4 | 0 | 0 | 0 | 0 | 4 |
| Infinite Campus | 4 | 0 | 0 | 0 | 0 | 4 |
| InfoEd | 3 | 0 | 0 | 0 | 0 | 3 |
| Jenzabar | 13 | 7 | 2 | 4 | 0 | 0 |
| Kuali Coeus | 4 | 0 | 0 | 0 | 0 | 4 |
| Kuali Curriculum Management | 4 | 0 | 0 | 0 | 0 | 4 |
| Kuali Financial System | 5 | 0 | 0 | 0 | 0 | 5 |
| Liaison CAS | 4 | 0 | 0 | 0 | 0 | 4 |
| National Student Clearinghouse | 4 | 0 | 0 | 0 | 0 | 4 |
| Oracle PeopleSoft Campus Solutions | 14 | 4 | 2 | 8 | 0 | 0 |
| Parchment | 3 | 0 | 0 | 0 | 0 | 3 |
| Populi | 4 | 3 | 0 | 1 | 0 | 0 |
| PowerCampus | 6 | 0 | 0 | 0 | 0 | 6 |
| PowerFAIDS | 3 | 0 | 0 | 0 | 0 | 3 |
| PowerSchool SIS | 9 | 0 | 0 | 0 | 0 | 9 |
| QuickSchools | 4 | 0 | 0 | 0 | 0 | 4 |
| Rediker Software | 7 | 0 | 0 | 0 | 0 | 7 |
| Regent Education | 4 | 0 | 0 | 0 | 0 | 4 |
| RenWeb | 7 | 0 | 0 | 0 | 0 | 7 |
| SIMS | 7 | 0 | 0 | 0 | 0 | 7 |
| SITS | 9 | 3 | 3 | 3 | 0 | 0 |
| ScholarSite | 3 | 0 | 0 | 0 | 0 | 3 |
| SchoolAdmin | 4 | 0 | 0 | 0 | 0 | 4 |
| Skyward Student Management | 6 | 0 | 0 | 0 | 0 | 6 |
| Smart Catalog | 7 | 0 | 0 | 0 | 0 | 7 |
| StudIS | 5 | 0 | 0 | 0 | 0 | 5 |
| Synergy Student Information System | 7 | 0 | 0 | 0 | 0 | 7 |
| Tribal Student Management | 7 | 0 | 0 | 0 | 0 | 7 |
| Unit4 Student Management | 13 | 0 | 0 | 0 | 0 | 13 |
| Veracross | 4 | 0 | 0 | 0 | 0 | 4 |
| Workday Student | 11 | 1 | 5 | 5 | 0 | 0 |

### Patterns needing attention

- ❓ **Anthology Student** `[html]` `campusm\.com` — suspect
- ❓ **Anthology Student** `[html]` `campus-management` — suspect
- ❓ **Anthology Student** `[html]` `cmnet` — suspect
- ❓ **Anthology Student** `[html]` `campusmgmt` — suspect
- ❓ **Anthology Student** `[html]` `campusnexus` — suspect
- ❓ **Anthology Student** `[html]` `campus.*nexus` — suspect
- 🔍 **Anthology Student** `[html]` `anthology` — needs-review — _FP on: Almabase_
- ❓ **Anthology Student** `[html]` `anthology\.com` — suspect
- ❓ **Anthology Student** `[html]` `campus\.anthology\.com` — suspect
- ❓ **Anthology Student** `[html]` `class=anthology` — suspect
- ❓ **Anthology Student** `[scripts]` `campusm` — suspect
- ❓ **Anthology Student** `[scripts]` `cmnet` — suspect
- ❓ **Anthology Student** `[scripts]` `campusnexus` — suspect
- 🔍 **Anthology Student** `[js]` `Anthology` — needs-review — _FP on: Almabase_
- ❓ **Anthology Student** `[js]` `CampusNexus` — suspect
- ❓ **AwardSpring** `[scripts]` `awardspring` — suspect
- ❓ **Ellucian Colleague** `[html]` `datatel[^>]*colleague` — suspect
- ❓ **Ellucian Colleague** `[html]` `class=colleague-` — suspect
- ❓ **Ellucian Colleague** `[scripts]` `ellucian.*colleague` — suspect
- ❓ **Ellucian Colleague** `[scripts]` `datatel` — suspect
- 🔍 **Ellucian Colleague** `[js]` `Colleague` — needs-review — _FP on: 25Live, 25Live +68_
- 🔍 **Ellucian Colleague** `[js]` `DatatelUI` — needs-review — _FP on: 25Live, 25Live +68_
- ❓ **Jenzabar** `[html]` `CampusWeb` — suspect
- ❓ **Jenzabar** `[scripts]` `jenzabar` — suspect
- ❓ **Jenzabar** `[scripts]` `jics` — suspect
- ❓ **Jenzabar** `[scripts]` `jenzabar\.com` — suspect
- 🔍 **Jenzabar** `[js]` `Jenzabar` — needs-review — _FP on: 25Live, 25Live +69_
- 🔍 **Jenzabar** `[js]` `JICS` — needs-review — _FP on: 25Live, 25Live +69_
- 🔍 **Oracle PeopleSoft Campus Solutions** `[html]` `campus.*solutions` — needs-review — _FP on: Jenzabar, TerminalFour_
- ❓ **Oracle PeopleSoft Campus Solutions** `[html]` `PS_TOKEN` — suspect
- ❓ **Oracle PeopleSoft Campus Solutions** `[html]` `PSPRODNAME.*Campus` — suspect
- ❓ **Oracle PeopleSoft Campus Solutions** `[html]` `/psp/` — suspect
- ❓ **Oracle PeopleSoft Campus Solutions** `[html]` `\?cmd=login` — suspect
- ❓ **Oracle PeopleSoft Campus Solutions** `[scripts]` `peoplesoft` — suspect
- ❓ **Oracle PeopleSoft Campus Solutions** `[scripts]` `pscs` — suspect
- ❓ **Oracle PeopleSoft Campus Solutions** `[scripts]` `oracle.*ps` — suspect
- ❓ **Oracle PeopleSoft Campus Solutions** `[cookies]` `PS_TOKEN` — suspect
- 🔍 **Oracle PeopleSoft Campus Solutions** `[js]` `PeopleSoft` — needs-review — _FP on: 25Live, 25Live +69_
- ❓ **Populi** `[scripts]` `populi` — suspect
- 🔍 **SITS** `[html]` `sits\.urd` — needs-review — _FP on: TerminalFour_
- 🔍 **SITS** `[html]` `/urd/sits\.urd/run/` — needs-review — _FP on: TerminalFour_
- ❓ **SITS** `[html]` `tribal.*sits` — suspect
- ❓ **SITS** `[scripts]` `tribal.*sits` — suspect
- 🔍 **SITS** `[js]` `SITS` — needs-review — _FP on: CAS, Panopto +1_
- ❓ **SITS** `[js]` `TribalSITS` — suspect
- 🔍 **Workday Student** `[html]` `workday.*student` — needs-review — _FP on: Element451, Element451 Search_
- ❓ **Workday Student** `[html]` `workdayhcm` — suspect
- ❓ **Workday Student** `[html]` `wd-.*student` — suspect
- 🔍 **Workday Student** `[html]` `workday` — needs-review — _FP on: Element451, Element451 Search +1_
- 🔍 **Workday Student** `[html]` `workday\.com` — needs-review — _FP on: Ellucian Colleague_
- 🔍 **Workday Student** `[html]` `wd5\.myworkday\.com` — needs-review — _FP on: Ellucian Colleague_
- ❓ **Workday Student** `[html]` `class=wd-` — suspect
- ❓ **Workday Student** `[scripts]` `wd-app` — suspect
- ❓ **Workday Student** `[headers]` `x-workday-client=.*` — suspect
- 🔍 **Workday Student** `[js]` `Workday` — needs-review — _FP on: Element451, Element451 Search +1_

