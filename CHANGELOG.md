# [1.48.0](https://github.com/EchonLabs/kanvaro.com/compare/v1.47.0...v1.48.0) (2026-10-27)


### Bug Fixes

* allow facilitators to access stand-ups without being team members ([e9862a8](https://github.com/EchonLabs/kanvaro.com/commit/e9862a89f164c8aa67b751a99845fbe1714aaec5))
* allow task creation without an assignee on create-new-task page ([17d5087](https://github.com/EchonLabs/kanvaro.com/commit/17d50876d149a42092512855f67af1bba7a85693))
* breadcrumb navigation and task creation flow with improved routing and tooltips ([824be2e](https://github.com/EchonLabs/kanvaro.com/commit/824be2e858b83370e0f3ee819b64ecfc4ae540e6))
* **docs:** apply the caller's className in every MarkdownRenderer state ([b8a22cc](https://github.com/EchonLabs/kanvaro.com/commit/b8a22ccdc81e8ac3ab91e584501834cc833ba84d))
* enhance Standup settings panel with navigation and UI improvements ([f313000](https://github.com/EchonLabs/kanvaro.com/commit/f31300024848c980febf67228bcdca0f4530063f))
* ensure UI updates after optimistic edits by reloading data ([0a7a477](https://github.com/EchonLabs/kanvaro.com/commit/0a7a477e866d79384643c4fab78fcba4b9f7c17b))
* implement functionality to reopen already-planned sprints with confirmation ([9a18fa0](https://github.com/EchonLabs/kanvaro.com/commit/9a18fa0367d3df1442dfb237a8d498347ad19ec9))
* **permissions:** match teamMembers subdocuments when resolving project role ([4c779ed](https://github.com/EchonLabs/kanvaro.com/commit/4c779ed7361862b88d172e333ef79daf7ec6b6ac))
* **permissions:** revive the dead team-member branch in task and test routes ([28727e8](https://github.com/EchonLabs/kanvaro.com/commit/28727e80721c1e68c7a9a8a98dfda63bf0d99335))
* **poker:** mark outliers by distance from the median, not by extremes ([9cce096](https://github.com/EchonLabs/kanvaro.com/commit/9cce0962d0c6a9944bfd2778ca20c5362db4e1c5))
* **projects:** gate the stepper tick on step validity and persist project roles ([9976383](https://github.com/EchonLabs/kanvaro.com/commit/9976383d05ca965db7581dcf08d7547def8ab789))
* rework the run screen and its page ([96e448e](https://github.com/EchonLabs/kanvaro.com/commit/96e448e638ff37b39aded40e1ea1e65cf225e971))
* **sprints:** add hover and focus detail to the debt trend chart and match its height to allocation health ([1d00373](https://github.com/EchonLabs/kanvaro.com/commit/1d0037394e62ab61653e36ae47dfb1eeabe85909))
* **sprints:** drop the doubled padding on the analytics pages ([230224a](https://github.com/EchonLabs/kanvaro.com/commit/230224ab59d871973034a6d862d397111737f716))
* **sprints:** give the override log's member column room for a name on one line ([50081fd](https://github.com/EchonLabs/kanvaro.com/commit/50081fd1e2da8695c195113e2bf9135f19989389))
* **sprints:** keep the override log's date and type on one line ([07b2703](https://github.com/EchonLabs/kanvaro.com/commit/07b270329d427947ad11b5bd274575dd9f514ab2))
* **sprints:** refine task cleanup logic in sprint GET handler to ensure accurate status handling ([07b53d8](https://github.com/EchonLabs/kanvaro.com/commit/07b53d8a3c4324fc23bc564b5d3759dadcc66695))
* **sprints:** replace always-visible start-blocked caption with InfoTooltip ([643f740](https://github.com/EchonLabs/kanvaro.com/commit/643f740cfdad55f4135317b3519fd25a6b32a2f2))
* **sprints:** stop auto-naming from overwriting a typed sprint name ([cfb498c](https://github.com/EchonLabs/kanvaro.com/commit/cfb498c9dcbda52dabdde7d3223edd8583758d47))
* **standup:** accept attendance when backfilling a missed stand-up ([77c6449](https://github.com/EchonLabs/kanvaro.com/commit/77c6449379e16142333dd5066953a2dbf1fd70f4))
* **standup:** accept re-estimate answers on a missed stand-up ([e0c9145](https://github.com/EchonLabs/kanvaro.com/commit/e0c9145b0bdb7d95bec91490ec532520b86e24f4))
* **standup:** add pointer-activation distance so clicks don't misfire as drag starts ([e1b05a0](https://github.com/EchonLabs/kanvaro.com/commit/e1b05a00951ea34877f0ff1aca92d33335ffd0fd))
* **standup:** address review findings on oversight redesign ([99b29d7](https://github.com/EchonLabs/kanvaro.com/commit/99b29d712bbd16471c06dca6109e9d35b4d8bc79))
* **standup:** align sprint/poker/task API routes with planning workflow updates ([16624d4](https://github.com/EchonLabs/kanvaro.com/commit/16624d42197323f462c7875ad58bf4f621fdc2bf))
* **standup:** answer 404 for a malformed id instead of a 500 ([cb11f2d](https://github.com/EchonLabs/kanvaro.com/commit/cb11f2d55cb2a835f2454a7ec700029d3b06bd8a))
* **standup:** assume a standard day when a member has no capacity row ([edfc5eb](https://github.com/EchonLabs/kanvaro.com/commit/edfc5eb4c348126859912ea9f88d38e9169da502))
* **standup:** author the blocker enum validation messages ([3c21af6](https://github.com/EchonLabs/kanvaro.com/commit/3c21af649a6eedc1a2c11eb13585a32495e6aee2))
* **standup:** await the pool's assignment callback so the split screen's lock holds ([138f956](https://github.com/EchonLabs/kanvaro.com/commit/138f9568ca519a65280c31d3f02a6c3dc3b829dc))
* **standup:** board reports recorded attendance so CC-7 can pass ([db3adf2](https://github.com/EchonLabs/kanvaro.com/commit/db3adf2490daf068b915a2807dfcd25d9ae761b2))
* **standup:** carry forward blockers/tasks on member removal and task deletion ([395fca4](https://github.com/EchonLabs/kanvaro.com/commit/395fca4801ff4359b5025af6dd3ce54aae29d216))
* **standup:** carry the real carried-forward minutes into the member card ([5ce7c8f](https://github.com/EchonLabs/kanvaro.com/commit/5ce7c8fb9e842421ff62fdd24efb3e200c4d6c3e))
* **standup:** CC-1 now fails a present member with nothing allocated ([5738fa9](https://github.com/EchonLabs/kanvaro.com/commit/5738fa9369f2ff6d3b7bd849d2add806a7e51e9a))
* **standup:** close self-select bypass and enforce RUN-26 server-side ([da8c6c6](https://github.com/EchonLabs/kanvaro.com/commit/da8c6c6a364a65c72e1cde8416a8503c0d3ffafe))
* **standup:** close the live-completion path on a Missed stand-up ([65d1493](https://github.com/EchonLabs/kanvaro.com/commit/65d1493a34b6ab303862f43ed00f7d9e8fd082c9))
* **standup:** commit planning/types.ts and planning/gates.ts ([5b129a6](https://github.com/EchonLabs/kanvaro.com/commit/5b129a65e28f1d964b85bd8c5296276d3b02a700))
* **standup:** commit the planning-gate string keys this plan's code depends on ([cd67b21](https://github.com/EchonLabs/kanvaro.com/commit/cd67b21b3e143d8d23d4b8b5b077fff335da90d7))
* **standup:** complete CapacityBreakdown fixture in MyStandupScreen test ([6688ff7](https://github.com/EchonLabs/kanvaro.com/commit/6688ff7d9ec70ec1b3faefc78d1235a387901239))
* **standup:** compute the day-one progress meter from real allocation data ([a452c44](https://github.com/EchonLabs/kanvaro.com/commit/a452c449422c3b901ee5a58dd890a42765aedabd))
* **standup:** correct ageBand vocabulary and carry-forward/blocker field mapping in seed backfill ([0b83da0](https://github.com/EchonLabs/kanvaro.com/commit/0b83da0fd763aaa2a3e7e307f4ba50bb89f13a36))
* **standup:** count the real carry-forward chain and audit per member ([0157e41](https://github.com/EchonLabs/kanvaro.com/commit/0157e4105bd011ecda2774b874cb8d99c908458e))
* **standup:** create the missed_standup_rollup item spec §13.2 requires ([18d5921](https://github.com/EchonLabs/kanvaro.com/commit/18d59216fb46cf74a43057d923ae0dd756f017f7))
* **standup:** detach a backfilled absentee's allocations and audit what was claimed ([9a962b8](https://github.com/EchonLabs/kanvaro.com/commit/9a962b83b4072cb006afa386e504a51dee2cc6c8))
* **standup:** drop a noted item from CFW-11's summary strip ([f51420d](https://github.com/EchonLabs/kanvaro.com/commit/f51420dbf68d2a76d963048ae7951ee7ad07d928))
* **standup:** enforce the 20-character holiday revoke reason client-side ([dc933c5](https://github.com/EchonLabs/kanvaro.com/commit/dc933c5fba1ecb86411729023769bf86ec35efaf))
* **standup:** enforce the RUN-23 stale-version guard on debt write-off ([f5955a7](https://github.com/EchonLabs/kanvaro.com/commit/f5955a772e252db0d289a50fa8c47c7cb0f0eaa3))
* **standup:** extract the open-standup query so a second stand-up today is discoverable, not silently dropped ([39999b7](https://github.com/EchonLabs/kanvaro.com/commit/39999b7bc0f05b0454a921a8f7cbc3b48fe85a5c))
* **standup:** fire N7 on override-driven completion, prove INV-8's next-standup anchor, document the runId resume contract ([83a8f1c](https://github.com/EchonLabs/kanvaro.com/commit/83a8f1c0f9520d1eb5650748e4f07f7fae2ee0d9))
* **standup:** fix drag visibility/collision detection and restore the over-capacity warning ([97eda04](https://github.com/EchonLabs/kanvaro.com/commit/97eda04991295dcc2096c2a1caa4285194dcd849))
* **standup:** gate the Priority filter on tasks that actually have one ([56d603a](https://github.com/EchonLabs/kanvaro.com/commit/56d603a92bd5fbe53c63f9c2ddab654e03b6f49a))
* **standup:** guard Start Sprint against a double-submit ([b9da4fc](https://github.com/EchonLabs/kanvaro.com/commit/b9da4fc37f38e966383185ad1e1e4a6d0df9b382))
* **standup:** hide the completion panel on a completed stand-up ([370016d](https://github.com/EchonLabs/kanvaro.com/commit/370016d493e86a24f289dbca0645615b1de05d3a))
* **standup:** iterate analytics maps with Array.from for the project's TS target ([e53378d](https://github.com/EchonLabs/kanvaro.com/commit/e53378dbaa1d44d0534c46e345ead9832022be41))
* **standup:** keep the organisation's timezone when a holiday action creates its calendar ([3d628e8](https://github.com/EchonLabs/kanvaro.com/commit/3d628e8ac949a0d694bc4c479c44825ca6e7300c))
* **standup:** let a team member update their own yesterday row (spec §3.2) ([d281c1c](https://github.com/EchonLabs/kanvaro.com/commit/d281c1c888654c5105797546a44157427042aff2))
* **standup:** let backfill carry the facilitator's override for a check a past day cannot pass ([cf3c95c](https://github.com/EchonLabs/kanvaro.com/commit/cf3c95c0ddffdc0d13b285dfd4090964432b47a1))
* **standup:** let every poker voter see the reveal, not just the facilitator ([b25b20f](https://github.com/EchonLabs/kanvaro.com/commit/b25b20f53487df951fb5c4c8151be382c3e329aa))
* **standup:** let TaskCard take an explicit dnd-kit drag id ([8fe4be0](https://github.com/EchonLabs/kanvaro.com/commit/8fe4be04188cecd29f192efb89f5ec46f9e6104e))
* **standup:** make the backfill detach idempotent across a retry ([78e36dc](https://github.com/EchonLabs/kanvaro.com/commit/78e36dcd82f4dfeb8207bf44c83ff6e1eda5d873))
* **standup:** make the holiday refresh honest, bounded and safe to race ([9ced100](https://github.com/EchonLabs/kanvaro.com/commit/9ced100072e0edb191b4889035538c6f9ac86c98))
* **standup:** match the jump nav's day-one order to Panel 5's new position ([1cc487e](https://github.com/EchonLabs/kanvaro.com/commit/1cc487e3c0f71228efb8a53ead28717e44fbc7ca))
* **standup:** name the bad field when partialMinutes is not a number ([c23eef2](https://github.com/EchonLabs/kanvaro.com/commit/c23eef2779c59c84e2bc7a3c848b2f3a17d9d0e1))
* **standup:** namespace the read-only task rows inside a member card ([13fdfc9](https://github.com/EchonLabs/kanvaro.com/commit/13fdfc947fe42cb7cdbea52b56ad32363f7b13de))
* **standup:** only warn of an interrupted completion when a run id exists ([f03745f](https://github.com/EchonLabs/kanvaro.com/commit/f03745ffa1b54a28438e0ea3714deadfd2babe84))
* **standup:** open the run screen's Join call link in a new tab ([54c2820](https://github.com/EchonLabs/kanvaro.com/commit/54c2820a56c7052e7383f781e64dd2acce0973bd))
* **standup:** persist the RUN-6 present default when a stand-up starts ([b352c82](https://github.com/EchonLabs/kanvaro.com/commit/b352c826cc54a9f55286cba89afdc57e56ce3273))
* **standup:** pin N12's ledger anchor to the sprint's first stand-up ([a4bd392](https://github.com/EchonLabs/kanvaro.com/commit/a4bd392918f8122327740f45f44af2eae0c388d5))
* **standup:** point "open full stand-up" at the project's schedule hub ([57d8479](https://github.com/EchonLabs/kanvaro.com/commit/57d84797b1c00d3e3000159ef7db535528f3f1e2))
* **standup:** point the N1 reminder at My Stand-up ([0c6b1e9](https://github.com/EchonLabs/kanvaro.com/commit/0c6b1e994b9c67f57d987a2c40b6172dea7482e1))
* **standup:** project the blocker's raisedById so it can be filtered client-side ([3670512](https://github.com/EchonLabs/kanvaro.com/commit/367051239c34a04c8efea96f0563279409761412))
* **standup:** read holidaySets key from holiday-sets API response ([76df67c](https://github.com/EchonLabs/kanvaro.com/commit/76df67cbe69f8d9eecf7b0892ebf33864e6b7e89))
* **standup:** reconcile issued overrides against completion checks (AC-10) ([d12eec6](https://github.com/EchonLabs/kanvaro.com/commit/d12eec6cab17cfc1c1babff054aa77a26c561c88))
* **standup:** redirect to login when My Stand-up has no session ([26500bf](https://github.com/EchonLabs/kanvaro.com/commit/26500bfcbfc7b6ef903acb680006180b4f760e00))
* **standup:** refine planning checklist, poker, and sprint-state logic ([d375d8c](https://github.com/EchonLabs/kanvaro.com/commit/d375d8c6555dcf84c170bfa6b664cf0085854e51))
* **standup:** refuse an unknown attendance state before it is written ([90f93c0](https://github.com/EchonLabs/kanvaro.com/commit/90f93c0e5d414c54c41190a1816e14ba104101a2))
* **standup:** refuse the overrides a backfill cannot honestly issue, and stop a retry stacking them ([34348a0](https://github.com/EchonLabs/kanvaro.com/commit/34348a08a084f43b194e7b2e51df2fdfa3f6fddc))
* **standup:** remove dead code from sprint-close wiring ([ac3e993](https://github.com/EchonLabs/kanvaro.com/commit/ac3e9932432bbe867e49278ce88f7f601389021f))
* **standup:** render Panel 5 as the top panel on day one, per spec §15.8.10 ([299df95](https://github.com/EchonLabs/kanvaro.com/commit/299df95e8b024e994ecbb6272052f526bad601e0))
* **standup:** render summary sections as prose, not raw JSON (UI-10) ([2aac4dd](https://github.com/EchonLabs/kanvaro.com/commit/2aac4ddbeae219ade7360f02dbf01f72ad962b55))
* **standup:** render unrecorded attendance as unset rather than present ([c3d7f03](https://github.com/EchonLabs/kanvaro.com/commit/c3d7f0385672ded15eb92076428ec92e322c5ad8))
* **standup:** replace GateButton's inline reason span with InfoTooltip ([50c5ffa](https://github.com/EchonLabs/kanvaro.com/commit/50c5ffa79ce6f7b6ade28a393ac51ebbd3dabea2))
* **standup:** report authorisation refusals as FORBIDDEN ([c004a88](https://github.com/EchonLabs/kanvaro.com/commit/c004a887203fefc257cf18d2032902b5add243b5))
* **standup:** resolve and render the sprint-close table's owner and hours-available columns ([7d9f754](https://github.com/EchonLabs/kanvaro.com/commit/7d9f7549246ea69639e915c1d4bffcc76adc599d))
* **standup:** return onAdd's promise to the pool instead of voiding it ([648f41e](https://github.com/EchonLabs/kanvaro.com/commit/648f41e4c4b8be30e59a6ed571a9a2da2d536b93))
* **standup:** return the overrides already issued with the checks ([c843f96](https://github.com/EchonLabs/kanvaro.com/commit/c843f96608a0f3f778ff9a11282c4bf272e583fb))
* **standup:** route override-modal validation copy through standupStrings, add real POST invocation tests ([70c9b88](https://github.com/EchonLabs/kanvaro.com/commit/70c9b881bea37fcb11a0fe9613f6156662d6b1ad))
* **standup:** say why an own-row allocation was refused ([768cdf8](https://github.com/EchonLabs/kanvaro.com/commit/768cdf8940d3870030e5889caf5592ed9114bc54))
* **standup:** scope seed removal to seed-created data only, add preflight checks, fix stale header ([878c300](https://github.com/EchonLabs/kanvaro.com/commit/878c300ccee52980a80be1b70521622b8abc8198))
* **standup:** scope Sprint 2 --remove cleanup to seed-created documents only ([8b731a0](https://github.com/EchonLabs/kanvaro.com/commit/8b731a0c32da91c9a538fd6b5d31ccaf8d5c5428))
* **standup:** show poker estimates in their unit and fix round state bugs ([fd2a792](https://github.com/EchonLabs/kanvaro.com/commit/fd2a7920c558d245f1676b3c79b2a01cbd7de6ac))
* **standup:** single-source completeDisabled to match CompletionPanel ([51c05d4](https://github.com/EchonLabs/kanvaro.com/commit/51c05d42b61177e3f684b38a309548ed954b8cb1))
* **standup:** stabilize planning, completion, and notification services ([c821188](https://github.com/EchonLabs/kanvaro.com/commit/c8211888c0bdeb3454b5e4f4941a5c721e04bded))
* **standups:** update scheduled start times to use current date and improve project filtering logic ([28d13a4](https://github.com/EchonLabs/kanvaro.com/commit/28d13a44ace00b0441e558ed36d3f3716a6a7f6e))
* **standups:** update text sizes for improved readability across the oversight screen ([0a9a4be](https://github.com/EchonLabs/kanvaro.com/commit/0a9a4be6d5693769b049e6dbb9c7d387cb447b0e))
* **standup:** tidy up config settings, dialog, and shared helpers ([b1d5754](https://github.com/EchonLabs/kanvaro.com/commit/b1d575439a9df5f5c75e4174ee8642672400d828))
* **standup:** update run/planning UI, navigation, and My Stand-up screen ([6767fa5](https://github.com/EchonLabs/kanvaro.com/commit/6767fa55f2f3c46356b1b1ba74a77cbef8c948fe))
* **standup:** use Array.from(new Set()) instead of a Set spread, matching this repo's target and house style ([a713a91](https://github.com/EchonLabs/kanvaro.com/commit/a713a917d271a91f8494c4ef4f9d03aa63af214a))
* **standup:** use RegExp constructor to avoid es5 unicode-flag literal error ([05a3335](https://github.com/EchonLabs/kanvaro.com/commit/05a33357f3234bb7470a3d0731eea80ebe1f1c0a))
* **standup:** visible failures on My Stand-up, shared RUN-26, tidy-ups ([2e739a2](https://github.com/EchonLabs/kanvaro.com/commit/2e739a299dab285cc4a8a0fc8ccf7a2c60b81929))
* **standup:** wire real variance data into CC-3 instead of leaving it not_evaluated ([9731c17](https://github.com/EchonLabs/kanvaro.com/commit/9731c1790a6beec5c9753c56978423bb1449d31d))
* **standup:** wire the Panel 7 Override action into the run screen (Task 22) ([92d5c4f](https://github.com/EchonLabs/kanvaro.com/commit/92d5c4f5e1efad163a45046c3e4dd9b7e7a57a7e))
* **standup:** wire the raise-blocker button to a real form and the existing API ([6dea348](https://github.com/EchonLabs/kanvaro.com/commit/6dea348d804e097e5e1edeae8a50ec7bec4790d7))
* **tasks:** return 404 for an unknown or malformed task id ([50a8ec5](https://github.com/EchonLabs/kanvaro.com/commit/50a8ec59f410b95b5d60b11374e4c9410dde4696))
* update estimation unit descriptions and ensure Fibonacci deck is used for hours ([f88a59e](https://github.com/EchonLabs/kanvaro.com/commit/f88a59e234f66808cd49d5b21dfebd2971fd442d))
* update PokerInvitePopup to use localStorage for dismissed invites and ensure single notification display ([3ab5d5c](https://github.com/EchonLabs/kanvaro.com/commit/3ab5d5c7b1a84d69f2795966cac0e55178e32e09))


### Features

* add API route structure documentation and holiday seed data for Sri Lanka ([134f7c5](https://github.com/EchonLabs/kanvaro.com/commit/134f7c5cde0994a8b5324b6d1d2f42a2a7408826))
* add comprehensive tests for standup job functionalities, including cron job handling, job locking, and saga execution ([3e2a129](https://github.com/EchonLabs/kanvaro.com/commit/3e2a129430ce7e03cce4fc7040805e1ad68bcc93))
* add documentation for background jobs and the stand-up scheduler ([e23bf56](https://github.com/EchonLabs/kanvaro.com/commit/e23bf5602b916431c7e032eee2fd3be56a0fc3d6))
* add holiday data for Sri Lanka 2026 and 2027, implement MongoDB seeding script, and enhance notification and permission systems for standup module ([ccddb53](https://github.com/EchonLabs/kanvaro.com/commit/ccddb53969b233324e8703600190d05d6dfd5024))
* add holiday revocation integration tests and permissions for holiday administration ([25c0b0e](https://github.com/EchonLabs/kanvaro.com/commit/25c0b0e46684eca93a10d9aebdc74245cb4e448e))
* add Jest configuration and setup files for testing ([15434e3](https://github.com/EchonLabs/kanvaro.com/commit/15434e3be962f4347e9895b560f7841b4a03493e))
* add PlanningWorkspace, PointsMigrationDialog, and PokerModal components ([4ee1a82](https://github.com/EchonLabs/kanvaro.com/commit/4ee1a823c36e91cb3612836deb7880d6495cf8a9))
* add StandupSettingsPanel and WorkingCalendarSettings components ([9a32b9d](https://github.com/EchonLabs/kanvaro.com/commit/9a32b9d144fd11964acdb02a29ced58487b89f65))
* add task status category support to Project model and tests ([5602735](https://github.com/EchonLabs/kanvaro.com/commit/560273567b5d2616e633c7446a59180eaa3a7912))
* document Phase 0 findings for stand-up module implementation ([799f308](https://github.com/EchonLabs/kanvaro.com/commit/799f308ddf404ed37056a89b3bef125aa4edbe48))
* enhance search and filtering capabilities across multiple routes ([d1382cd](https://github.com/EchonLabs/kanvaro.com/commit/d1382cd9201c50a7c5954aa5899d008685028757))
* enhance standup module with participant resolution, permission checks, and UI improvements ([a8b65ce](https://github.com/EchonLabs/kanvaro.com/commit/a8b65cee49ddbcd88be4ffd867cca02f5cbd6b36))
* implement authorization checks for cron jobs and add health degradation endpoint ([88e58c7](https://github.com/EchonLabs/kanvaro.com/commit/88e58c7f6681323aa3f8144e41816ba3417c2eb6))
* implement background job models and update environment configuration for stand-up jobs ([404ee80](https://github.com/EchonLabs/kanvaro.com/commit/404ee80a9bf0e2a1209b5088176c1b2d2ac1394a))
* implement DegradationBanner component and associated tests for displaying module capabilities ([70559ab](https://github.com/EchonLabs/kanvaro.com/commit/70559abfe77a63a3b4fd62ed3c82e0db36e65c2b))
* implement getLoggedMinutes and related functions for time tracking in stand-up module ([3d83a62](https://github.com/EchonLabs/kanvaro.com/commit/3d83a62bc37c95caa2adcf63021f38ce5c49902a))
* implement global setup and teardown for in-memory MongoDB in Jest tests ([f6b1760](https://github.com/EchonLabs/kanvaro.com/commit/f6b17602e3fc29a4a306aaf777f8a62efee565b3))
* implement holiday and working calendar models with associated schemas ([37d8aa7](https://github.com/EchonLabs/kanvaro.com/commit/37d8aa7457c0c7df69ee5b55326144230b859494))
* implement holiday management routes including revoke, update, and list functionalities ([c85f947](https://github.com/EchonLabs/kanvaro.com/commit/c85f94793a573e46a68f9a621740df092efb22b9))
* implement organization-wide holiday management functionality, including holiday creation, revocation, and coverage checks ([64c9c07](https://github.com/EchonLabs/kanvaro.com/commit/64c9c07a3f55d9c3c05a4734b15636fd4ada57d3))
* implement planning gate and waiver logic ([25d2370](https://github.com/EchonLabs/kanvaro.com/commit/25d237059c00077ca9f4449da811ffac10547b6f))
* implement points migration and task estimation endpoints with validation and audit logging ([0dcb492](https://github.com/EchonLabs/kanvaro.com/commit/0dcb492d7efc84b10efdbd2f1d45cd596176ec1f))
* implement sprint schedule reconciliation and related functionalities ([9fafc59](https://github.com/EchonLabs/kanvaro.com/commit/9fafc594f79e3c0cf2e1bc1cf7839e846303f4b7))
* implement stand-up module entities and notifications in ActivityLog and Notification models ([fc99fd0](https://github.com/EchonLabs/kanvaro.com/commit/fc99fd0017accaa182d46834ca3f167ae609faa8))
* implement standup generation and reconciliation endpoints, including schedule retrieval and snapshot management ([9fc95d9](https://github.com/EchonLabs/kanvaro.com/commit/9fc95d9eb02bf30c18b795cd24fb3b70750087e4))
* implement standup job functionalities including generation audit, marking missed stand-ups, sending reminders, and promoting to ready ([68d8b7a](https://github.com/EchonLabs/kanvaro.com/commit/68d8b7a7740d7ee12aafa60b4dc2c4fc39a6edb9))
* implement standup job scheduler, authentication, logging, and heartbeat functionality ([ca0795d](https://github.com/EchonLabs/kanvaro.com/commit/ca0795d208fddc31439715b3dfc8bc89d0dbd595))
* implement standup module with estimation and sprint planning features including Sprint state machine + models ([ae3ded1](https://github.com/EchonLabs/kanvaro.com/commit/ae3ded1ae3a9552f4db343f6d2bf1c9aa0701338))
* implement standup schedule and management functionalities, including new components and calendar date handling ([565fa04](https://github.com/EchonLabs/kanvaro.com/commit/565fa04054e3927080a2e3a463b14f04af0bb30e))
* **log:** add pretty log formatting for terminal output and enhance job run logging ([6d02995](https://github.com/EchonLabs/kanvaro.com/commit/6d029953c219c724e2046df8864c54f28fce6a82))
* **nav:** add the Analytics item to Sprint Management in the sidebar and mobile menu ([c44545c](https://github.com/EchonLabs/kanvaro.com/commit/c44545c85d989a9bdde0f873d6b665f272fa0e59))
* **poker:** implement live poker invite notifications and session updates ([b9b1d0e](https://github.com/EchonLabs/kanvaro.com/commit/b9b1d0eb5e3ffbae0d99c3f280109280c7399c64))
* **poker:** implement live session updates and enhance voting functionality ([08fe8f8](https://github.com/EchonLabs/kanvaro.com/commit/08fe8f8d1f709c5b2900899344de64437d536b72))
* refactor UnassignedPool to remove unassigned tab and streamline task display ([2bfe7ec](https://github.com/EchonLabs/kanvaro.com/commit/2bfe7ec8f310a64da449ced10d5527fb37c6e999))
* **sprints:** add the stand-up analytics page to the sprint management module ([86f014c](https://github.com/EchonLabs/kanvaro.com/commit/86f014c3f03c759ab24b0ea7377126b118b7e229))
* **sprints:** add the stand-up analytics sprint picker ([b549825](https://github.com/EchonLabs/kanvaro.com/commit/b5498254d501f74022494504fe69ee4ef072207e))
* **sprints:** add the stand-up analytics widgets and their strings ([ba2a6d5](https://github.com/EchonLabs/kanvaro.com/commit/ba2a6d5a661ed9ae1da1a33dde933055e33eebc2))
* **standup:** add a FORBIDDEN code for plain authorisation refusals ([d8246bc](https://github.com/EchonLabs/kanvaro.com/commit/d8246bc0d20eea9293f4f18fa380375c9badea9f))
* **standup:** add a per-project estimation unit so hours are not multiplied as points ([13525ad](https://github.com/EchonLabs/kanvaro.com/commit/13525ada0d9581e232381278a4948cdcfb7103fd))
* **standup:** add allocation and attendance services ([31e4ace](https://github.com/EchonLabs/kanvaro.com/commit/31e4ace0eb15caccdd7b54316d44c9cc924e990f))
* **standup:** add Allocation model and pure allocation rules ([b4a1205](https://github.com/EchonLabs/kanvaro.com/commit/b4a1205274e56e1754671b0e464ffd948b9918e5))
* **standup:** add allocation primitives ([5c0a355](https://github.com/EchonLabs/kanvaro.com/commit/5c0a35582ee0b9d441e58813a033278f458a2a62))
* **standup:** add allocation, attendance and checks routes ([e627051](https://github.com/EchonLabs/kanvaro.com/commit/e627051cf7293f1612f948a4c9b0c07287abed6d))
* **standup:** add AllocationVariance model ([f058541](https://github.com/EchonLabs/kanvaro.com/commit/f0585410b2b465c7937fa4207e2d4d951fffd5c6))
* **standup:** add API refresh and default-calendar controls to Global Settings ([a8701ff](https://github.com/EchonLabs/kanvaro.com/commit/a8701ffd36785e9e241db01f3366f726ff52aa49))
* **standup:** add assignment roster/service with planning-session assignments endpoint ([616c6f3](https://github.com/EchonLabs/kanvaro.com/commit/616c6f33b87a62da30f2f8bb05fab474f8f3fe49))
* **standup:** add backfill route and extract shared completion-context loader ([7a049e6](https://github.com/EchonLabs/kanvaro.com/commit/7a049e6a31569b35f9b0f701cd4ec52f5cc1dc15))
* **standup:** add canonical AssignableTaskView/MemberView types and adapters ([5e23f0d](https://github.com/EchonLabs/kanvaro.com/commit/5e23f0d60db5a5cd36871e06c43e3ae79f915172))
* **standup:** add capacity board, task pool and run screen ([4ddbf28](https://github.com/EchonLabs/kanvaro.com/commit/4ddbf286e1545da4aff7c63153730eb62319565f))
* **standup:** add carry-forward register API routes ([6b97eb1](https://github.com/EchonLabs/kanvaro.com/commit/6b97eb14b7af18ddab004963e64cbdb550475a9f))
* **standup:** add completion-check evaluator ([563d3e8](https://github.com/EchonLabs/kanvaro.com/commit/563d3e8a8520ad716139215fbfaa15abe047ad2d))
* **standup:** add estimate debt ledger and settlement engine ([8589c7c](https://github.com/EchonLabs/kanvaro.com/commit/8589c7c331834fd5311bf56b7e0284145335fe6d))
* **standup:** add ExpandableMemberCard as the split-screen drop target ([116460f](https://github.com/EchonLabs/kanvaro.com/commit/116460ffe654a5b4e29c6328a1104c2f274255e2))
* **standup:** add holiday-API refresh, key, and default-calendar routes ([1b0c4aa](https://github.com/EchonLabs/kanvaro.com/commit/1b0c4aa40052cc5c4e8b10855b31c96a33fbc827))
* **standup:** add holiday-API schema fields and error code ([8da8457](https://github.com/EchonLabs/kanvaro.com/commit/8da845776fcd599a6041fa7b53e7c32c9aa0154f))
* **standup:** add planning poker results, oversight dashboard, and shared UI components ([4e817a3](https://github.com/EchonLabs/kanvaro.com/commit/4e817a3c4d6a246659693ff23fc4fc7359cad8c7))
* **standup:** add poker results endpoint and reorganize poker UI components ([13792b3](https://github.com/EchonLabs/kanvaro.com/commit/13792b30689e836511f188a2cb2ae1de47eb5347))
* **standup:** add pure aggregation functions for stand-up analytics ([151f71d](https://github.com/EchonLabs/kanvaro.com/commit/151f71d313d2c066c7b1e2f7af0192cc8520fc16))
* **standup:** add pure override validation rules (OVR-3/4/5) ([0f0f161](https://github.com/EchonLabs/kanvaro.com/commit/0f0f161d7c7bd4c0c03160f17b22aac2ceb2450f))
* **standup:** add repository height adjustment props and enhance attendance summary display ([da064e4](https://github.com/EchonLabs/kanvaro.com/commit/da064e480897e725af98fe3044fd9d2bd83d60dd))
* **standup:** add shared copy, estimate floor and absence helper for the run screen ([906502e](https://github.com/EchonLabs/kanvaro.com/commit/906502e955e54bfc02f7b208f5fcc9a7bc66734a))
* **standup:** add shared TaskCard for the split-screen task repository ([caf41ec](https://github.com/EchonLabs/kanvaro.com/commit/caf41ec7b5719d7de887e42fca0abc7191bb1672))
* **standup:** add stand-up start route and service ([9e2b41f](https://github.com/EchonLabs/kanvaro.com/commit/9e2b41f8476a34093c2ba4a69cc09a6b5494d224))
* **standup:** add sticky settings action bar with dirty tracking ([43de384](https://github.com/EchonLabs/kanvaro.com/commit/43de384f713e73e1a6464ff3b98c74ff12120746))
* **standup:** add sticky settings action bar with dirty tracking ([1b31f69](https://github.com/EchonLabs/kanvaro.com/commit/1b31f696297f035385d048ecb50fa22789ffc75d))
* **standup:** add task ownership resolution and logged-time lookup ([f61d5cc](https://github.com/EchonLabs/kanvaro.com/commit/f61d5cc1321a5b4da4cd6a934347ce32cc6d1a25))
* **standup:** add Task.sprintCloseDisposition for CC-8 ([a82f5b9](https://github.com/EchonLabs/kanvaro.com/commit/a82f5b9aa6f67bb4807da7cf57b16a9705cb850d))
* **standup:** add TaskAssignmentSplitScreen with pool filter/sort helpers ([912c234](https://github.com/EchonLabs/kanvaro.com/commit/912c23450d3ae5ad28b58406061fe1936352356f))
* **standup:** add the also-today banner, next-standup strip and capacity headline ([20b7b37](https://github.com/EchonLabs/kanvaro.com/commit/20b7b3719efd0136b847904f45b0852ad99aa86b))
* **standup:** add the analytics payload builder and sprint loader ([902390b](https://github.com/EchonLabs/kanvaro.com/commit/902390b4be11478a9e10259e1a1a6e7712f8e058))
* **standup:** add the backfill dialog and not-started reason modal ([216ceaf](https://github.com/EchonLabs/kanvaro.com/commit/216ceafc16a2ae7183d652a18880274ab40bd5d6))
* **standup:** add the Blockers section, reusing RaiseBlockerModal ([5e43498](https://github.com/EchonLabs/kanvaro.com/commit/5e434980fd16b6c0be716ac7775930ad92d7c44d))
* **standup:** add the carry-forward register model ([b62988f](https://github.com/EchonLabs/kanvaro.com/commit/b62988f24037d482075420f5709ef65bb2d179ba))
* **standup:** add the missing PATCH route for resolving/updating a blocker ([569d4d9](https://github.com/EchonLabs/kanvaro.com/commit/569d4d927b15bd4910208e2529fd0462ca421ebb))
* **standup:** add the My position section - carry-forward items owned by this member ([3bcaf5b](https://github.com/EchonLabs/kanvaro.com/commit/3bcaf5b1b6c4c2479cc5263eb3e3ef07797b7731))
* **standup:** add the shared primitives for My Stand-up's redesign ([e746a5b](https://github.com/EchonLabs/kanvaro.com/commit/e746a5b2a945fae2d39e511a9426005169ca9e78))
* **standup:** add the sprint analytics route with the full and aggregate views ([e97246d](https://github.com/EchonLabs/kanvaro.com/commit/e97246d31cceef905df767df9b2c39e6e5c932ed))
* **standup:** add the StandupBlocker model (RUN-14) ([d77c902](https://github.com/EchonLabs/kanvaro.com/commit/d77c90298b41e8ff445900ed24f8c41af67c140e))
* **standup:** add the StandupOverride model (spec 16.2) ([8677e2b](https://github.com/EchonLabs/kanvaro.com/commit/8677e2b55fddf3dec03a0480ce233cd5757285f5))
* **standup:** add the Yesterday section - the UI-12 lever for a short meeting ([ec5888d](https://github.com/EchonLabs/kanvaro.com/commit/ec5888df192d56aa796a2a6d7342371e9dc5badd))
* **standup:** add variance classification and estimate revision engine ([f1e660a](https://github.com/EchonLabs/kanvaro.com/commit/f1e660a82264ab0f829e44c1b854eecff3491f68))
* **standup:** add yesterday recap panel ([bc98764](https://github.com/EchonLabs/kanvaro.com/commit/bc9876409d4cbbc3bc7ff587fb80245c6b70a7a3))
* **standup:** Apple HIG polish, calendar fixes, and completion-check bug fix ([9047f21](https://github.com/EchonLabs/kanvaro.com/commit/9047f2160e157302037f49eae360e8666aac3d78))
* **standup:** blocker routes and withBlockerPermission ([6cf0b38](https://github.com/EchonLabs/kanvaro.com/commit/6cf0b38c443a82008020adc7014dc2fc6e1d1dcb))
* **standup:** blocker service - raise, update, resolve (RUN-14-18) ([fd63618](https://github.com/EchonLabs/kanvaro.com/commit/fd63618bdf0889b9258d430694f342dcb6f34197))
* **standup:** build the carry-forward engine and wire it into the scheduler ([7840b22](https://github.com/EchonLabs/kanvaro.com/commit/7840b22de0ddc45b63340ca69377523b879b5819))
* **standup:** carry onSprintTeam through AssignableMemberView ([7eb2e70](https://github.com/EchonLabs/kanvaro.com/commit/7eb2e7083a524ae321f7730df7339a186b9149dd))
* **standup:** collect attendance in the backfill dialog ([9a44771](https://github.com/EchonLabs/kanvaro.com/commit/9a447718a5fa222ba159c2efad9b646e9f1472c2))
* **standup:** complete RUN-10's yesterday-panel actions ([bd6060c](https://github.com/EchonLabs/kanvaro.com/commit/bd6060cb0ec39325890c0c9b47ddb1b0a82051e8))
* **standup:** completionState checkpoint field, StandupSummary model, pure summary builder ([035bd56](https://github.com/EchonLabs/kanvaro.com/commit/035bd56b8b2586c73c36c63519bb3d333f78e512))
* **standup:** compose the redesigned My Stand-up screen from its sections ([82cf936](https://github.com/EchonLabs/kanvaro.com/commit/82cf936fede3f17d10e9fd8ebde1081c62974c95))
* **standup:** count chronic under-allocation members per sprint ([520b041](https://github.com/EchonLabs/kanvaro.com/commit/520b041aed9851e8835406a462a20b56ee3d3bdb))
* **standup:** decompose summary page into card components ([3231cf3](https://github.com/EchonLabs/kanvaro.com/commit/3231cf3a01ce9c99d56dbbcbc939b320d4ef4d07))
* **standup:** drag tasks between the backlog and sprint-scope panes ([e29f87e](https://github.com/EchonLabs/kanvaro.com/commit/e29f87e530ad15570ec4d028f2b9b1bfe61ea680))
* **standup:** dual-timezone rendering (NFR-20) ([8e916af](https://github.com/EchonLabs/kanvaro.com/commit/8e916af10bf8a102d87b6bbc2c2578877f0cfc60))
* **standup:** enhance attendance reporting and update URLs for standup navigation ([1217234](https://github.com/EchonLabs/kanvaro.com/commit/12172346da5d1e7d0a77652575b4ed467db45ae5))
* **standup:** enhance blocker functionality with standupId and error messages ([b894b9f](https://github.com/EchonLabs/kanvaro.com/commit/b894b9f606fa1428eb89a64af5516664cf09b060))
* **standup:** enhance keyboard navigation for settings panel and add validation error handling ([97b06a0](https://github.com/EchonLabs/kanvaro.com/commit/97b06a0d6141ed26720204d804dfb9ec90e7fc5e))
* **standup:** enhance task assignment display with assignee names and improve panel logic ([c499152](https://github.com/EchonLabs/kanvaro.com/commit/c49915253c0c333882b921aa57bca684b651e126))
* **standup:** enhance team workload visibility and breadcrumb navigation across sprint pages ([2a999b2](https://github.com/EchonLabs/kanvaro.com/commit/2a999b2075cb4addce97a6ed9881c4d7a9f7ec15))
* **standup:** expose buildCarryForwardSet via POST, matching the variance route's seam ([2979ab2](https://github.com/EchonLabs/kanvaro.com/commit/2979ab226587a3a115d6265f5151dfe6496578e4))
* **standup:** extend allocation, summary, and yesterday services ([915aec2](https://github.com/EchonLabs/kanvaro.com/commit/915aec29e0ed06d6ece7a082f94d6cd65ea1d16e))
* **standup:** fetch yesterday/variance/carry-forward/blockers in parallel on My Stand-up ([a3cead8](https://github.com/EchonLabs/kanvaro.com/commit/a3cead847013d1945f29adcc16be7b2593172068))
* **standup:** finish and align the Sprint Cadence & Execution Spine with the design system ([0f9b40c](https://github.com/EchonLabs/kanvaro.com/commit/0f9b40c5114a04fb2287ef193112b08d220493f5))
* **standup:** finish oversight screen redesign ([200f8a6](https://github.com/EchonLabs/kanvaro.com/commit/200f8a647cee9d29443f788b99932aac3072b3c6))
* **standup:** floor analytics debt per member and add the seven-day debt change ([08244da](https://github.com/EchonLabs/kanvaro.com/commit/08244dac17f079d437360a16d574113eecda1d28))
* **standup:** give My Stand-up an icon system and a hero capacity ring ([dc3ffe9](https://github.com/EchonLabs/kanvaro.com/commit/dc3ffe9fd233cc1afa562553a9a520d78addb5dd))
* **standup:** hydrate My Stand-up from the allocation board ([60c4b02](https://github.com/EchonLabs/kanvaro.com/commit/60c4b02eb0dd98f0eca731d63439174d85f86236))
* **standup:** implement acknowledgements for advisory checks and enhance task estimation handling ([3d329de](https://github.com/EchonLabs/kanvaro.com/commit/3d329de3b68d6829a04bd1b4ba562bb2334e0791))
* **standup:** implement calendar change notifications and impact previews ([87ae335](https://github.com/EchonLabs/kanvaro.com/commit/87ae33552a95d6b58e111acb8089b343b050dfcb))
* **standup:** implement CC-8 final-day disposition check ([d3eb413](https://github.com/EchonLabs/kanvaro.com/commit/d3eb41348c4d60e7e7757fd45437de9221d6ac18))
* **standup:** implement CC-9 and CC-11 (blockers, sprint health) ([e92ac4f](https://github.com/EchonLabs/kanvaro.com/commit/e92ac4f88606fd8490737e688b232fbc4ba21ddb))
* **standup:** implement ceremony management and capacity deduction logic ([eeaaa95](https://github.com/EchonLabs/kanvaro.com/commit/eeaaa95d2a3f532a7d935dc5d8ef7e403f413145))
* **standup:** implement ModalOverlay component for centered backdrop dialogs ([ee6fe00](https://github.com/EchonLabs/kanvaro.com/commit/ee6fe00eb668a8db3dada9918eb63012cf8a6bdf))
* **standup:** implement notification URL resolution and enhance standup summary features ([36d5c6d](https://github.com/EchonLabs/kanvaro.com/commit/36d5c6d48f81cc000222e78c03718f3ae4bbdc11))
* **standup:** implement RaiseBlockerModal and ResolveBlockerDialog components ([b691fba](https://github.com/EchonLabs/kanvaro.com/commit/b691fba32f1e1050bb399953bbbe799f8834d669))
* **standup:** implement stand-ups tab and settings panel in project detail page ([570a99c](https://github.com/EchonLabs/kanvaro.com/commit/570a99c152b46a46f70144fa057d646d881d7b5a))
* **standup:** issue overrides and detect chronic under-allocation (OVR-1/6/9) ([c7407be](https://github.com/EchonLabs/kanvaro.com/commit/c7407bec77547a15fbb6c76234bf63bf024fbd67))
* **standup:** let a backfill attest an over-allocated missed day ([46d04bc](https://github.com/EchonLabs/kanvaro.com/commit/46d04bc6ebf814ae9ae1db4b216feded40a2400b))
* **standup:** let TaskCard group assignment options under an optgroup ([15c66c7](https://github.com/EchonLabs/kanvaro.com/commit/15c66c716624b73a803dc575afdca3f09bf295f5))
* **standup:** let the split screen take explicit assignment options ([8d026a7](https://github.com/EchonLabs/kanvaro.com/commit/8d026a71590720c316bdf802f295b3ed5e00e126))
* **standup:** link oversight sprint cards to the sprint analytics page ([0fb3ea7](https://github.com/EchonLabs/kanvaro.com/commit/0fb3ea700d15d28aaa52029099b8d1f95ba23a27))
* **standup:** mark a member card that is not on the sprint team yet ([9cdad83](https://github.com/EchonLabs/kanvaro.com/commit/9cdad832c9695d62456af254338541ea2d503e13))
* **standup:** move the project filter out of the title into a new button ([58b2212](https://github.com/EchonLabs/kanvaro.com/commit/58b22121bec25567497dfd9555c1a7e2bcec48bd))
* **standup:** My Stand-up member view (UI-12, ALO-22/23, RUN-26) ([f4896d1](https://github.com/EchonLabs/kanvaro.com/commit/f4896d1a195719471ba85881856eefe380b03e2d))
* **standup:** N4/N5/N6/N7/N11 sends (§9.5) ([a9fd6d4](https://github.com/EchonLabs/kanvaro.com/commit/a9fd6d40b75345dd95297ef9bd9dd98c8a695e19))
* **standup:** override route and modal (§15.12, §17.6) ([b860aa2](https://github.com/EchonLabs/kanvaro.com/commit/b860aa2dfd3e0cf4548fbeed6f67b93c33a991da))
* **standup:** OVR-7 followup item and double-defer refusal ([32a3edf](https://github.com/EchonLabs/kanvaro.com/commit/32a3edf1ac015615b381051a124e3339f5df5d04))
* **standup:** Panel 6 (blockers) replaces the stub ([e063091](https://github.com/EchonLabs/kanvaro.com/commit/e06309128ed0f7d34f23ba292a8cc6c3849696f7))
* **standup:** POST /complete — wires the saga to the run screen (RUN-19-22, §17.6) ([dd1f38f](https://github.com/EchonLabs/kanvaro.com/commit/dd1f38f636d187f42244e5a087c82814f487a89f))
* **standup:** pure blocker rules (RUN-14/15/18) ([a9c1834](https://github.com/EchonLabs/kanvaro.com/commit/a9c1834e24808ac2f5c36cc3118b007af4b82c41))
* **standup:** pure CC-8/CFW-9 readiness evaluators ([78e7fb3](https://github.com/EchonLabs/kanvaro.com/commit/78e7fb38f666e52628cf2ce6173921090a70716f))
* **standup:** pure sprint-health calculation (CC-11/N12) ([f9cd8fd](https://github.com/EchonLabs/kanvaro.com/commit/f9cd8fd8287427ac2363adb7ad1266cd7d69c7f3))
* **standup:** read-only leave and exceptions on My Stand-up (OB-14) ([ab2fc8c](https://github.com/EchonLabs/kanvaro.com/commit/ab2fc8cdc1da8448ee9fef7c25a9d6e210646cbf))
* **standup:** redesign admin oversight screen for escalation triage ([1558a2f](https://github.com/EchonLabs/kanvaro.com/commit/1558a2ffa30e71eecc0ec86fefda51db14c80eff))
* **standup:** redesign run screen with Apple HIG design tokens ([20b0c8d](https://github.com/EchonLabs/kanvaro.com/commit/20b0c8d6c73de9c17b4f864b2e2bed2626bff753))
* **standup:** refine sprint planning workspace and assignment board ([2becaf5](https://github.com/EchonLabs/kanvaro.com/commit/2becaf55204a72a8383908175f9ccb9836ad7968))
* **standup:** rename planning poker card assets to match card values ([b5e27a2](https://github.com/EchonLabs/kanvaro.com/commit/b5e27a237c79e3f719128f611b32c33a0f0be655))
* **standup:** reopen within window, downstream recompute list (RUN-4/5) ([67601c2](https://github.com/EchonLabs/kanvaro.com/commit/67601c2713c093e3377a1502d82025acd1fd1c33))
* **standup:** replace the estimated-scope stat with a capacity gauge ([652cfbb](https://github.com/EchonLabs/kanvaro.com/commit/652cfbba7086db0b25aefe092bfdfc58872fdc0a))
* **standup:** resolve and show the facilitator's name on the schedule hub ([71c908c](https://github.com/EchonLabs/kanvaro.com/commit/71c908cd300fdd9aed709c9c1df3ce4cdc7671ff))
* **standup:** resolve sprint names for the My Stand-up filter button ([9ec01e2](https://github.com/EchonLabs/kanvaro.com/commit/9ec01e2b746209fedf0e39c60bf812a78d42694b))
* **standup:** resolve the caller's current stand-up for My Stand-up ([7457ecf](https://github.com/EchonLabs/kanvaro.com/commit/7457ecf13827df58a3e6c301702779cd2db53dee))
* **standup:** section 15.17 keyboard shortcuts on the run screen ([0452d99](https://github.com/EchonLabs/kanvaro.com/commit/0452d99f92cf52b1077169259281396ca3b07146))
* **standup:** seed script backfills StandupSummary docs, fixes summary screen ([f71769d](https://github.com/EchonLabs/kanvaro.com/commit/f71769d35664def3655dbd618e1b909ae1762976))
* **standup:** seed script creates Sprint 2's live day-one stand-up with a real capacity gap ([fd107d0](https://github.com/EchonLabs/kanvaro.com/commit/fd107d0f4bb555fcafbc704ca63d4ae4d34cde65))
* **standup:** seed script fixes project team roles (HR off team, QA/PM/Anessa correct, self-correcting) ([8947124](https://github.com/EchonLabs/kanvaro.com/commit/8947124ccd2b6e4bc1477f8d5b02f8010718c109))
* **standup:** seed script populates the existing Sprint 2 placeholder into an active sprint with real tasks ([a548269](https://github.com/EchonLabs/kanvaro.com/commit/a548269a45630b3a56c5bf16f7a2347cd219b77d))
* **standup:** show sprint scope as a persistent pane next to the backlog ([8f5d603](https://github.com/EchonLabs/kanvaro.com/commit/8f5d603fd4a2421acc7cb7dec7cf41ea0f9a57a9))
* **standup:** show the backfill dialog's unpassable checks and take one attestation ([f9e08b5](https://github.com/EchonLabs/kanvaro.com/commit/f9e08b514eaa611e1489538c865b1c57ac7999b2))
* **standup:** show today's primary action (Start/Resume/View summary) per UI-8 ([ff0df2b](https://github.com/EchonLabs/kanvaro.com/commit/ff0df2b4127f2baf7057d4578d588346068cc5b8))
* **standups:** implement project selection for standup schedule and analytics ([f3c39ee](https://github.com/EchonLabs/kanvaro.com/commit/f3c39ee33424906e2cb426c62a742c04dbd3f2e4))
* **standup:** sprint-close readiness API routes ([55d11ad](https://github.com/EchonLabs/kanvaro.com/commit/55d11ad81055bcc1d4540c92cc0b4c53a3b699aa))
* **standup:** sprint-close readiness loader and disposition writer ([24e6f58](https://github.com/EchonLabs/kanvaro.com/commit/24e6f5872ba3538ca3bfa9cdcbf330690acb7240))
* **standup:** Sprint-close-readiness panel ([525ed96](https://github.com/EchonLabs/kanvaro.com/commit/525ed96fe2c3421014b1543de198a47f268408c9))
* **standup:** sprint-health job and N12 (§18.1) ([415fd57](https://github.com/EchonLabs/kanvaro.com/commit/415fd57c8f1d743fbb12945f8123e161302982f4))
* **standup:** sprint-wide open-blocker aggregation for oversight ([f6c13dc](https://github.com/EchonLabs/kanvaro.com/commit/f6c13dc7ea5e418c0307305ffb4c7ed0e9993efa))
* **standup:** summary read/export routes and the read-only summary screen (§15.13, UI-10/11) ([91bd9e5](https://github.com/EchonLabs/kanvaro.com/commit/91bd9e5ec165a73818aa780203896ac7c24fbac7))
* **standup:** surface holiday administration as a Settings tab ([8165859](https://github.com/EchonLabs/kanvaro.com/commit/81658592f5478800214b3a846f84b18abc0a904a))
* **standup:** sync a holiday set from the induwara.lk API ([6276168](https://github.com/EchonLabs/kanvaro.com/commit/6276168300fbd094617582b3330195b6fcc220a2))
* **standup:** the completion saga (RUN-19-22), resumable without a Mongo transaction ([a3a5853](https://github.com/EchonLabs/kanvaro.com/commit/a3a5853363ebc54a886a12b3cdc7dc4001d37f08))
* **standup:** upgrade Today's plan to a real section with sources and a live total ([82ece90](https://github.com/EchonLabs/kanvaro.com/commit/82ece907a037dd6644c0c237de79eefe76b6762e))
* **standup:** use absolute request base URL for sprint planning pages ([19aaf5c](https://github.com/EchonLabs/kanvaro.com/commit/19aaf5c797544d82822caf84f2a394eca0fa502a))
* **standup:** widen the shared split screen for the stand-up run ([a1bd6ad](https://github.com/EchonLabs/kanvaro.com/commit/a1bd6ad36d2371a1dd37765b416f57b49ade99df))
* **standup:** wire ALO-22/23 self-select and top-up into the allocations route ([3618b42](https://github.com/EchonLabs/kanvaro.com/commit/3618b4256abca3485f768bc33bdced54f22fcc6a))
* **standup:** wire assignment board and poker carousel into planning workspace ([dc7195b](https://github.com/EchonLabs/kanvaro.com/commit/dc7195bba663498de2e8266d91be0881fbd7cc22))
* **standup:** wire CC-8 and CFW-9 through to the board and the saga ([cc2c9ec](https://github.com/EchonLabs/kanvaro.com/commit/cc2c9ece46457e31ea74878ea4110fe66b360868))
* **standup:** wire chronic under-allocation and blocker detail into org oversight ([34f8212](https://github.com/EchonLabs/kanvaro.com/commit/34f8212afcc6c98f964cbe985c9b532f79452c64))
* **standup:** wire debt, variance and yesterday panels into run screen ([7ffd644](https://github.com/EchonLabs/kanvaro.com/commit/7ffd644b58b80e393d8f1407c0c5fc016775537c))
* **standup:** wire Panel 4 into the run screen ([6509e14](https://github.com/EchonLabs/kanvaro.com/commit/6509e143e8a657792e016903dea52b0b5556cd7f))
* **standup:** wire sprint-close readiness into the run screen ([ba01ac6](https://github.com/EchonLabs/kanvaro.com/commit/ba01ac66883271610d3689d3335015a5ee68693d))
* **standup:** wire the run-screen page to variance, yesterday, revision, reason and debt-ledger endpoints ([248656d](https://github.com/EchonLabs/kanvaro.com/commit/248656dd4b50aba4c94973a493e93c2dde9f32e1))
* **tests:** add comprehensive tests for poker session handling and UI components ([af1ed2b](https://github.com/EchonLabs/kanvaro.com/commit/af1ed2be0f45e96d6ef6eac70b3da2e386133db3))
* **tests:** add regression tests for authentication and search filters ([e4875ab](https://github.com/EchonLabs/kanvaro.com/commit/e4875ab147ae0f479a562dae0671ab20b0436cb7))
* **tests:** update unassigned pool tests to reflect panel opening behavior and assignee display ([0c831c2](https://github.com/EchonLabs/kanvaro.com/commit/0c831c225155bcb3150fde9d6b812e33e0760896))
* **ui:** add shared InfoTooltip component ([2e73bd5](https://github.com/EchonLabs/kanvaro.com/commit/2e73bd5da7bfcb66f9f4abcddaed8cd49eaef7f0))
* **ui:** improve mobile menu, sidebar, and task modal for standup navigation ([4760cad](https://github.com/EchonLabs/kanvaro.com/commit/4760cadc186b4832412f588574ff15acb5e8837e))
* update API parameter names for consistency and improve error handling messages ([9852879](https://github.com/EchonLabs/kanvaro.com/commit/9852879ecc0bc101c5d52dbcdc355484a2b1bf67))
* update breadcrumb navigation to reflect project and sprint names for improved clarity ([570164d](https://github.com/EchonLabs/kanvaro.com/commit/570164d8ec938f0b29c7de0eb8c12823e202a301))


### Reverts

* Revert "fix(permissions): revive the dead team-member branch in task and test routes" ([19757ba](https://github.com/EchonLabs/kanvaro.com/commit/19757ba23898849122d1bd84a2c24722e9e4d0dd))

# [1.47.0](https://github.com/EchonLabs/kanvaro.com/compare/v1.46.3...v1.47.0) (2026-10-23)


### Bug Fixes

* prevent moved sprint badge wrapping on long task titles ([b8dbba4](https://github.com/EchonLabs/kanvaro.com/commit/b8dbba484c3bd2ea3e98af9dda9d22a87515c043))
* unarchive tasks when assigning to sprint and restore items on sprint reopen ([db0b16e](https://github.com/EchonLabs/kanvaro.com/commit/db0b16edb68941772c3b1933a322e96d60742bf2))


### Features

* add bulk task ID paste tool and moved task indicators ([e1ace1e](https://github.com/EchonLabs/kanvaro.com/commit/e1ace1e12db0c9ce343543dd611355ba0388b5d4))

## [1.46.3](https://github.com/EchonLabs/kanvaro.com/compare/v1.46.2...v1.46.3) (2026-10-20)


### Bug Fixes

* unarchive and reset completedAt when moving task to backlog ([d222389](https://github.com/EchonLabs/kanvaro.com/commit/d222389293c60ae36414b4d9bd42982aa5ea6c2a))

## [1.46.2](https://github.com/EchonLabs/kanvaro.com/compare/v1.46.1...v1.46.2) (2026-10-09)


### Bug Fixes

* add missing timezone parameter to timer poll requests ([36d4de9](https://github.com/EchonLabs/kanvaro.com/commit/36d4de981b9b7855dc3b06b322eaa0616d427695))
* apply category filter to task fetching in kanban board ([78586d0](https://github.com/EchonLabs/kanvaro.com/commit/78586d0a3183c56f139780ae0480962ca7e73a76))
* validate remaining daily time against schema min session limit ([81eeed5](https://github.com/EchonLabs/kanvaro.com/commit/81eeed5d34c7722708becd61e64d88cb896d4af6))

## [1.46.1](https://github.com/EchonLabs/kanvaro.com/compare/v1.46.0...v1.46.1) (2026-10-08)


### Bug Fixes

* add alphabetical sorting to missed project and assignee dropdowns ([5f717e2](https://github.com/EchonLabs/kanvaro.com/commit/5f717e291aa41c655663cea9770db15d3bf58682))
* add client timezone support across all timer operations ([ea85c40](https://github.com/EchonLabs/kanvaro.com/commit/ea85c40d0ad27daae8c51fe4ed249a6d0581c3cf))
* redirect to backlog page after successful task creation ([f8eb0e4](https://github.com/EchonLabs/kanvaro.com/commit/f8eb0e44300a352240c9254eac8bc25756aad953))

# [1.46.0](https://github.com/EchonLabs/kanvaro.com/compare/v1.45.7...v1.46.0) (2026-10-08)


### Features

* add refresh button ([a54f464](https://github.com/EchonLabs/kanvaro.com/commit/a54f46417a3c41b843366ec1933a3c3e1a96a1fa))
* open task view and edit actions in new tab from tasks page ([6452121](https://github.com/EchonLabs/kanvaro.com/commit/645212163c759c6b5eed5a047d7eb50b92246a72))
* preserve filters across navigation ([c94f01a](https://github.com/EchonLabs/kanvaro.com/commit/c94f01ae6045406f0c9506937056f86867cbd26c))

## [1.45.7](https://github.com/EchonLabs/kanvaro.com/compare/v1.45.6...v1.45.7) (2026-10-06)


### Bug Fixes

* prevent duplicate task overdue reminders ([f32c201](https://github.com/EchonLabs/kanvaro.com/commit/f32c20151908127c860d58c09e3aef171b67eeb9))
* sync daily hours logged with client timezone in timer API ([6c948db](https://github.com/EchonLabs/kanvaro.com/commit/6c948dbbb2eeb69d4de98957fbf172a1896bfbe6))
* update task category dropdown on delete and category migration in task forms ([dd35b8e](https://github.com/EchonLabs/kanvaro.com/commit/dd35b8eca52087d6e662c71fcd6deefa6a91599b))

## [1.45.6](https://github.com/EchonLabs/kanvaro.com/compare/v1.45.5...v1.45.6) (2026-10-05)


### Bug Fixes

* resolve daily limit reset issue with dual timezone check ([39b459e](https://github.com/EchonLabs/kanvaro.com/commit/39b459e8cbcad663d4ec1054dd7972cc41dea5f9))
* timezone-aware daily time limit enforcement for timer and manual logs ([d751ca4](https://github.com/EchonLabs/kanvaro.com/commit/d751ca4fecd979ca15c990d004bd6076f9e36bd5))

## [1.45.5](https://github.com/EchonLabs/kanvaro.com/compare/v1.45.4...v1.45.5) (2026-10-02)


### Bug Fixes

* add periodic timer sync ([e173e8a](https://github.com/EchonLabs/kanvaro.com/commit/e173e8a02f9a33b2f3538a92c3628ac9ebe3c741))

## [1.45.4](https://github.com/EchonLabs/kanvaro.com/compare/v1.45.3...v1.45.4) (2026-10-02)


### Bug Fixes

* add alphabetical sorting with natural ordering to all project dropdowns ([63c9cc5](https://github.com/EchonLabs/kanvaro.com/commit/63c9cc57546facf319ee41df65c8144ee39ba7e1))
* fix column visibility in "All Projects" view ([012f67e](https://github.com/EchonLabs/kanvaro.com/commit/012f67e8110f5da02df1729709d8705819115866))
* sort dropdown options alphabetically across the application ([bc066a1](https://github.com/EchonLabs/kanvaro.com/commit/bc066a122eb1a882ec0342f221ca5db7d93bbb02))

## [1.45.3](https://github.com/EchonLabs/kanvaro.com/compare/v1.45.2...v1.45.3) (2026-09-30)


### Bug Fixes

* resolve TypeScript errors and missing types in CreateTaskModal ([23e4fd3](https://github.com/EchonLabs/kanvaro.com/commit/23e4fd3ede5a4a23ad95d0473ee20182b59500be))

## [1.45.2](https://github.com/EchonLabs/kanvaro.com/compare/v1.45.1...v1.45.2) (2026-09-30)


### Bug Fixes

* add default task categories for new projects ([f878dfe](https://github.com/EchonLabs/kanvaro.com/commit/f878dfe9c8a2e05b14221cb9cca51feb5fa0ad35))
* add reordering for task categories ([88bb1c7](https://github.com/EchonLabs/kanvaro.com/commit/88bb1c7f2aeadc2639145b94e1b7a2315e35f1a1))
* add total deleted count to notification cleanup ([e514984](https://github.com/EchonLabs/kanvaro.com/commit/e51498423f0df3aae2478512f0a96bce869e178c))
* category title display and update on deletion ([4c8a7f4](https://github.com/EchonLabs/kanvaro.com/commit/4c8a7f4143a972cea35ec5c728203aad5c29283e))

## [1.45.1](https://github.com/EchonLabs/kanvaro.com/compare/v1.45.0...v1.45.1) (2026-09-30)


### Bug Fixes

* refine email delivery for comment mentions and replies ([5100a48](https://github.com/EchonLabs/kanvaro.com/commit/5100a486448ad9457f6c9fbbf66b604302752a07))
* resolve flase unassign notifcation and imporve status update formating ([f2ffc41](https://github.com/EchonLabs/kanvaro.com/commit/f2ffc41d40b0c1f03dc898178cab3073df049bdb))

# [1.45.0](https://github.com/EchonLabs/kanvaro.com/compare/v1.44.0...v1.45.0) (2026-09-28)


### Bug Fixes

* add node-cron background schedulers for all tasks ([0367a75](https://github.com/EchonLabs/kanvaro.com/commit/0367a759f04ddb3287b56ee995742607e97bf33d))
* filter overdue task notifications by 7-day window ([36e377e](https://github.com/EchonLabs/kanvaro.com/commit/36e377eb61a572e2d47463ef10034d9c2af5dd0c))
* kanban board ui ([c029167](https://github.com/EchonLabs/kanvaro.com/commit/c029167b1447653f3c5c24849141f3030a2a94dd))
* update task schema for notifications ([500ea26](https://github.com/EchonLabs/kanvaro.com/commit/500ea2616240046b627357aabaf53395391e410f))


### Features

* add due-date reminder notifications ([21e16b1](https://github.com/EchonLabs/kanvaro.com/commit/21e16b178581bc0f4084409ed49cbb665fbb2b62))

# [1.44.0](https://github.com/EchonLabs/kanvaro.com/compare/v1.43.0...v1.44.0) (2026-09-28)


### Bug Fixes

* assignee notifications and add status transition details ([9d8116e](https://github.com/EchonLabs/kanvaro.com/commit/9d8116e1633e84ad70d4a09c43704cd3fd2ace89))
* handle unassignment and prevent duplicate task notifications ([96a1add](https://github.com/EchonLabs/kanvaro.com/commit/96a1add500ec9e4dd0c40bab160deafed3818430))


### Features

* [@mention](https://github.com/mention) notifications from general assignee alerts ([a0c9f40](https://github.com/EchonLabs/kanvaro.com/commit/a0c9f40a4606838c1aa326ab6a28b34f609fed14))

# [1.43.0](https://github.com/EchonLabs/kanvaro.com/compare/v1.42.4...v1.43.0) (2026-09-28)


### Features

* implement task category filtering be ([de9ab34](https://github.com/EchonLabs/kanvaro.com/commit/de9ab347039b9e773dd704a45aa30db45c34cf62))
* implement task category management ([5bab0d2](https://github.com/EchonLabs/kanvaro.com/commit/5bab0d26801e069353cf76d6e33c62e534fd12e7))
* implement task category management FE ([7f08cf3](https://github.com/EchonLabs/kanvaro.com/commit/7f08cf3fc65ae14bfba23f1ea7bd9e2feb56063c))
* interfact to create, rename, delete ([526c98a](https://github.com/EchonLabs/kanvaro.com/commit/526c98a83b505ca3572a1abf2f402c559131eb4c))

## [1.42.4](https://github.com/EchonLabs/kanvaro.com/compare/v1.42.3...v1.42.4) (2026-09-28)


### Bug Fixes

* Kanban board functionality ([82aaa4c](https://github.com/EchonLabs/kanvaro.com/commit/82aaa4c538c8a5bbece6ca830f50d4eb35fa21a3))
* virtualized task card spacing and height ([eaf724c](https://github.com/EchonLabs/kanvaro.com/commit/eaf724cdfd2343472147fa5d25427ec97017fe0b))

## [1.42.3](https://github.com/EchonLabs/kanvaro.com/compare/v1.42.2...v1.42.3) (2026-09-10)


### Bug Fixes

* showing memo instead of task title in timelogs ([4968b09](https://github.com/EchonLabs/kanvaro.com/commit/4968b0982ac6165d751eae8f4fb025aabee7b3e9))

## [1.42.2](https://github.com/EchonLabs/kanvaro.com/compare/v1.42.1...v1.42.2) (2026-09-09)


### Bug Fixes

* correct timer time-logging status response ([f2d1ea9](https://github.com/EchonLabs/kanvaro.com/commit/f2d1ea91ab57bdf52b1cf5fcfcca498b88449b58))
* document preview, requires the mammoth npm package ([887dfcd](https://github.com/EchonLabs/kanvaro.com/commit/887dfcdfb939d588c3537994b96e31afa6722587))
* sync package lockfile ([dcc4bb2](https://github.com/EchonLabs/kanvaro.com/commit/dcc4bb29566408393d34ec5cb63b2f24b616f59b))
* update document templates route path ([888afd3](https://github.com/EchonLabs/kanvaro.com/commit/888afd38bf7c70c80f7de7dbdc5f57edd5b49868))

## [1.42.1](https://github.com/EchonLabs/kanvaro.com/compare/v1.42.0...v1.42.1) (2026-09-07)


### Bug Fixes

* Kanban board dropdown alphabetically ([6532def](https://github.com/EchonLabs/kanvaro.com/commit/6532def4c3dd39495567c7ea4a874346ff7d2a21))
* sort dropdowns alphabetically ([9cc1ebe](https://github.com/EchonLabs/kanvaro.com/commit/9cc1ebe967e75779e7a6b37c37bfdd3befdfa82d))
* update kanban board dropdown ([e75bef1](https://github.com/EchonLabs/kanvaro.com/commit/e75bef12d7ca07c3cc874afde4cf1d9e7ff8f7a2))

# [1.42.0](https://github.com/EchonLabs/kanvaro.com/compare/v1.41.7...v1.42.0) (2026-08-07)


### Bug Fixes

* add ClipboardList icon to enhance no test cases found message ([562296a](https://github.com/EchonLabs/kanvaro.com/commit/562296a0b03a3a3ea0b9422609dcc2567b374ddb))
* add past time limit cutoff time to time tracking settings and update related logic ([0c4aa05](https://github.com/EchonLabs/kanvaro.com/commit/0c4aa053a3c8c6148f8176138ea9eeb988f8149b))
* add viewport configuration to improve layout stability on Android devices ([334df76](https://github.com/EchonLabs/kanvaro.com/commit/334df76c34c30aa1a9b5c5f1ac8ab332a5ec908f))
* enhance past date logging messages with friendly time format and error handling ([a125569](https://github.com/EchonLabs/kanvaro.com/commit/a12556942e2f3f017624c9bb9fcfa9edb1708be7))
* enhance project selection UI with scrollable dropdown for better usability ([d68555a](https://github.com/EchonLabs/kanvaro.com/commit/d68555ac408753839f5ae61c24a85ab84fcbb0cf))
* improve date handling for time tracking to avoid timezone issues ([3419e56](https://github.com/EchonLabs/kanvaro.com/commit/3419e56ee44be4932a1fd9e7b066b3c166146fd9))
* improve member ID extraction logic for better robustness in team member handling ([95b6f28](https://github.com/EchonLabs/kanvaro.com/commit/95b6f2854be3d4ac4e766a888ebbd15f82a9d568))
* remove unused focusSearchInput function and import it from utils ([9ffac70](https://github.com/EchonLabs/kanvaro.com/commit/9ffac703e87e872a4d657ffcb95004cb4be9fd80))
* update GanttChart styles for improved header visibility and layout consistency ([6b5b5e8](https://github.com/EchonLabs/kanvaro.com/commit/6b5b5e85aad4eeb3e3be6422b501e1970c201529))
* update pagination control to display items when tasks are present ([d6e85ac](https://github.com/EchonLabs/kanvaro.com/commit/d6e85ac70dfb55f8591b6abe1161e18989518970))


### Features

* add Manual Time Log modal and enhance time tracking permissions ([e328198](https://github.com/EchonLabs/kanvaro.com/commit/e328198e989f211b523dc24ccd33494da874e895))

## [1.41.7](https://github.com/EchonLabs/kanvaro.com/compare/v1.41.6...v1.41.7) (2026-07-31)


### Bug Fixes

* add max height to project selection dropdown in TimerPage ([ed9c3a8](https://github.com/EchonLabs/kanvaro.com/commit/ed9c3a86933c7e9fd64454cff718fe604f479d03))

## [1.41.6](https://github.com/EchonLabs/kanvaro.com/compare/v1.41.5...v1.41.6) (2026-07-31)


### Bug Fixes

* allow past dates for sprint creation and update validation messages ([1b69941](https://github.com/EchonLabs/kanvaro.com/commit/1b69941780295455c78e37df6a60442eaf9686d4))
* enhance searchable filters by adding unfiltered options for projects, assignees, and creators in TasksClient ([e593516](https://github.com/EchonLabs/kanvaro.com/commit/e593516a4f23a096600dea3e5cd589f45beed439))
* remove status update from task when starting sprint ([5824e7f](https://github.com/EchonLabs/kanvaro.com/commit/5824e7fa8e00b113c0bac941ed0d056a27ab6194))
* searchable filters mobile close fix for project, assignee, and creator in TasksClient ([83d73f8](https://github.com/EchonLabs/kanvaro.com/commit/83d73f88bc65db5abe413d9bab5772bd7f65b7ae))

## [1.41.5](https://github.com/EchonLabs/kanvaro.com/compare/v1.41.4...v1.41.5) (2026-07-27)


### Bug Fixes

* handle null or undefined user in GravatarAvatar and getAvatarData functions ([888b093](https://github.com/EchonLabs/kanvaro.com/commit/888b09334005516b616ce97817ad569540af2668))

## [1.41.4](https://github.com/EchonLabs/kanvaro.com/compare/v1.41.3...v1.41.4) (2026-07-27)


### Bug Fixes

* add memo copy functionality and improve task report layout ([7c27cee](https://github.com/EchonLabs/kanvaro.com/commit/7c27ceebb000adf655cf20bcbe6413f2e8fc13e1))
* add permission check for task creation button in calendar page ([44a592a](https://github.com/EchonLabs/kanvaro.com/commit/44a592aa822e21fc982bf68b4e4ba3d88114f870))
* enhance duration formatting in time entries to include hours and minutes ([006df6e](https://github.com/EchonLabs/kanvaro.com/commit/006df6ece1d87056ade17f18a6722fb1079215c3))
* increase task limit for improved data retrieval ([a03c6a6](https://github.com/EchonLabs/kanvaro.com/commit/a03c6a650564492123d593a9bd11a134e29b1270))
* optimize status badge animations and improve performance for live project indicators ([04efbda](https://github.com/EchonLabs/kanvaro.com/commit/04efbda0025bad493ac041afa04f563fe358f740))
* remove unnecessary animation classes from status badges for improved performance ([f5ca638](https://github.com/EchonLabs/kanvaro.com/commit/f5ca638dd4da33a8432a498e25461880ad7a399c))
* simplify profile page icons and improve layout consistency ([4c13d69](https://github.com/EchonLabs/kanvaro.com/commit/4c13d698acb3e545537d0891478b5bb19f9055e1))
* update badge styling for active timer to improve visual feedback ([234ed8a](https://github.com/EchonLabs/kanvaro.com/commit/234ed8a6debabd31eac7d4f5b34b109d146cee34))

## [1.41.3](https://github.com/EchonLabs/kanvaro.com/compare/v1.41.2...v1.41.3) (2026-07-24)


### Bug Fixes

* remove unused daily progress calculation and related UI elements from TimerPage ([d5afe0a](https://github.com/EchonLabs/kanvaro.com/commit/d5afe0a4fff5ae14d4601943d4b3bd20119d0956))

## [1.41.2](https://github.com/EchonLabs/kanvaro.com/compare/v1.41.1...v1.41.2) (2026-07-21)


### Bug Fixes

* add permission checks for creating projects and tasks in RecentProjects and RecentTasks components ([17615b2](https://github.com/EchonLabs/kanvaro.com/commit/17615b224ba2f148030bcfdcde6cac105846b35a))
* add taskType property to BacklogItem interface and update TypeBadge rendering ([2405816](https://github.com/EchonLabs/kanvaro.com/commit/2405816f98874606d4227777ff1a132a680280ff))
* add validation for first and last name length across member-related APIs and components ([0d0907b](https://github.com/EchonLabs/kanvaro.com/commit/0d0907b6699848d2d6891c0fc58fca4981411689))
* changed ui and layout of the pages to follow the current design of the project. ([29c1f9d](https://github.com/EchonLabs/kanvaro.com/commit/29c1f9dfa01c532d7514706b97c1b267c5b71d81))
* enhance time entry deletion permissions and management capabilities in TimeLogs component ([104edec](https://github.com/EchonLabs/kanvaro.com/commit/104edec7efd453629d72abf7d8f0557e4b6bb293))
* enhance timer stop functionality to ensure time entries are saved correctly ([8635c36](https://github.com/EchonLabs/kanvaro.com/commit/8635c362251d4c92da3932c47b22fbf7fbb398bc))
* implement cross-field validation for time tracking limits in settings and organization components ([84d4a9a](https://github.com/EchonLabs/kanvaro.com/commit/84d4a9a7f00aa8ee367fbcd0b5ef9be6a478d3c0))
* improve date validation logic and synchronization in AddSprintEventModal ([a9359cf](https://github.com/EchonLabs/kanvaro.com/commit/a9359cfb87f554db76d9ef4150f44da46f84a1a1))
* remove running timer minutes from week and month duration calculations in TimeTrackingWidget ([b3d9952](https://github.com/EchonLabs/kanvaro.com/commit/b3d9952615a68bebd4183ddef72563f7f3af88d6))
* restore permission checks for member deletion and update confirmation message for member removal ([c82da98](https://github.com/EchonLabs/kanvaro.com/commit/c82da9841e9f74bcc7ab4d991f9920123fe630c4))
* restore SPRINT_DELETE permission for roles and adjust project permission checks ([8155204](https://github.com/EchonLabs/kanvaro.com/commit/8155204b402c2b1929fdecdda5c88b427986d6ed))
* simplify button rendering for creating new sprints based on permission ([da413e8](https://github.com/EchonLabs/kanvaro.com/commit/da413e82748bac529858bcda66bc45afea85041f))
* update date calculations for start of week in multiple components and restore TASK_DELETE permission for roles ([422db6d](https://github.com/EchonLabs/kanvaro.com/commit/422db6d556b0e08bfbc7c62e3ccccf78bd39d021))
* update time entry deletion logic to require delete permission for all users and integrate ConfirmationModal for deletion confirmation ([e2cdeea](https://github.com/EchonLabs/kanvaro.com/commit/e2cdeeacbdbc6047a6a901881a4f480afb85a98d))

## [1.41.1](https://github.com/EchonLabs/kanvaro.com/compare/v1.41.0...v1.41.1) (2026-07-10)


### Bug Fixes

* remove description display from task component for cleaner UI ([e6c6e4e](https://github.com/EchonLabs/kanvaro.com/commit/e6c6e4e036669ae7ab243aac91b6bc93997fa154))
* update button styles in Timer and TimeTrackingPage for consistency and improved UI ([647b827](https://github.com/EchonLabs/kanvaro.com/commit/647b827e66a8062a6089d8124b559d6848610de8))

# [1.41.0](https://github.com/EchonLabs/kanvaro.com/compare/v1.40.1...v1.41.0) (2026-07-07)


### Bug Fixes

* add excludeStatus filter to task retrieval and update TimerPage parameters ([c44e87a](https://github.com/EchonLabs/kanvaro.com/commit/c44e87a988b26698cec12cad925d573a5b59d2ea))
* enhance income handling by adding custom subcategory support and validation ([51d8c04](https://github.com/EchonLabs/kanvaro.com/commit/51d8c04b35136ac325c0a957c12d182b8b9d14fd))
* income and expenses logic in project budget tab ([2fb29aa](https://github.com/EchonLabs/kanvaro.com/commit/2fb29aa5580f5801324099d4214ab438d3ea47a8))
* logic related to financial reports and related sub pages ([5f55bfc](https://github.com/EchonLabs/kanvaro.com/commit/5f55bfcee34837fabfff7a833be0a42854a2cd6d))
* persistent data in filters and incorrect Backlog sprint task addition ([835da7c](https://github.com/EchonLabs/kanvaro.com/commit/835da7c993acd6893105b52ee1c9c4f800fc9cbe))
* project backlog incorrect stat and info cards ([2446e15](https://github.com/EchonLabs/kanvaro.com/commit/2446e155ccf64693fc8f945bce79b2f29cd42bd9))
* reworked logic on all four sub pages of Team Reports page ([621d5bc](https://github.com/EchonLabs/kanvaro.com/commit/621d5bc016aeb82e5a4c2c0594c41817c87a3117))
* reworked the logic of the team tab to restrict Team members and QAs from removing members from the project ([d254674](https://github.com/EchonLabs/kanvaro.com/commit/d2546747aff5b749359f0a3ac8c12e14665bec8b))
* sprint completion and task transfer logic ([d0ba516](https://github.com/EchonLabs/kanvaro.com/commit/d0ba516a09893e5ebb2c946790f5d41514b4b9a3))
* update excludeStatus filter in TimerPage to remove backlog status ([4c5e4de](https://github.com/EchonLabs/kanvaro.com/commit/4c5e4de7407e684fab6679d4d8006987f20c464d))


### Features

* add example configuration file and remove existing config ([fbcabf2](https://github.com/EchonLabs/kanvaro.com/commit/fbcabf27ac13acd71e693df526b9a6076c8ca834))
* enhance configuration management with environment variables support ([fe438e8](https://github.com/EchonLabs/kanvaro.com/commit/fe438e888a9641aaaef3adaed2e8499bdefc705a))

## [1.40.1](https://github.com/EchonLabs/kanvaro.com/compare/v1.40.0...v1.40.1) (2026-06-24)


### Bug Fixes

* application error due to sprint event duration exceeding ([daa2510](https://github.com/EchonLabs/kanvaro.com/commit/daa251072754dfd4033e5442b626e621bb1e835c))
* calender page formatting and layout issues ([854360f](https://github.com/EchonLabs/kanvaro.com/commit/854360fd84b4245f9e620b235a2266672a9fa6fc))
* fixed the scrollbar popup in sprint events page. ([5017987](https://github.com/EchonLabs/kanvaro.com/commit/5017987ff95f218f00887ee7f970703623e48e44))
* fixed vertical scrollbar in Toast Notifications and added new info for Info cards in Project view page ([5c0c37b](https://github.com/EchonLabs/kanvaro.com/commit/5c0c37bbaee63e4646634bd150a209350ab5e5f4))
* handled the duplicate toast notifications and fixed the UI issue in the sprint event view page ([c07d856](https://github.com/EchonLabs/kanvaro.com/commit/c07d856c9a0291ae74b5e47e05c3bd1052ab7f54))
* layout and spacing issues in the Sprint page List View ([fbb49f0](https://github.com/EchonLabs/kanvaro.com/commit/fbb49f03480a732b020e3bf1a913d68e5def62f3))
* reworked the logic in the reports tab in the project view page. ([fff765a](https://github.com/EchonLabs/kanvaro.com/commit/fff765ab6b23d1a7cc9cc8a107a0abe48b03fe22))
* reworked the logic on all four sub pages of the Project Reports page ([0f4e7c1](https://github.com/EchonLabs/kanvaro.com/commit/0f4e7c1a4a4e9154769c2a2a1d8b71070cb95a60))
* scrollbar popup issue when no results were found ([e126c3f](https://github.com/EchonLabs/kanvaro.com/commit/e126c3f18bf8e2dfdb864c697044ea103eb2f025))
* showing unformatted task descriptions in the Tasks page List view ([8c11d6d](https://github.com/EchonLabs/kanvaro.com/commit/8c11d6d62ef55a334489876b3e63f6b842681c91))

# [1.40.0](https://github.com/EchonLabs/kanvaro.com/compare/v1.39.1...v1.40.0) (2026-06-15)


### Bug Fixes

* added the outline svg style to all Title svgs in all pages and made the sidebar active state follow the new UI theme ([3bffcb1](https://github.com/EchonLabs/kanvaro.com/commit/3bffcb13f5f88ad1809d2c969032aafe900b5590))
* changed all svgs to outlined svgs in all pages belonging to the Time Tracking Module ([4b64083](https://github.com/EchonLabs/kanvaro.com/commit/4b640835ffc8ff413fd3940af8c09dbeb00731e3))
* final adjustments for the sprint events and epic pages to follow the new UI theme. ([f12dfa6](https://github.com/EchonLabs/kanvaro.com/commit/f12dfa6154cbfa8440443e5618864806e8a521f4))
* member avatars not showing in the dashboard and Standup Dashboard ([7707d8d](https://github.com/EchonLabs/kanvaro.com/commit/7707d8d6b8e7cac2560a0ae85f3de0da93c7afad))
* redesigned the dashboard to fit the new theme and align with Apple design standards. ([d7d3af6](https://github.com/EchonLabs/kanvaro.com/commit/d7d3af6e52e6f73f3297096bf9ce993dd9474ac8))
* removed unnecessary and redundant .md files ([588bcd7](https://github.com/EchonLabs/kanvaro.com/commit/588bcd7a4ed68428948d200e0539660be33f9da7))
* replaced lucide icons with Outlined icons in the dashboard. ([d368cd9](https://github.com/EchonLabs/kanvaro.com/commit/d368cd96426bde0d3bf6dd28e5f5cd8c6ff409c2))
* upadeted all pages in the Test Management Module to use outlined svgs ([55c3c98](https://github.com/EchonLabs/kanvaro.com/commit/55c3c984e3458be630d5e6a1ba4bf914c769fe52))
* updated all pages in Settings Module to use outlined svgs ([ef5743b](https://github.com/EchonLabs/kanvaro.com/commit/ef5743b438e275982b4a70f88c8def56401fdcb8))
* updated all pages in the Reports Module to use outlined svgs ([472a0fd](https://github.com/EchonLabs/kanvaro.com/commit/472a0fd5db0a4c302aedb44063c899aeacf939dc))
* updated all pages related to Tasks Module and Project Module to use oulined svgs. ([94b5d74](https://github.com/EchonLabs/kanvaro.com/commit/94b5d74b70bb67597e660d3a1343367a1c6db93c))
* updated all scheduled standup pages to follow the new UI theme ([58c5667](https://github.com/EchonLabs/kanvaro.com/commit/58c5667d4a84eea2f733ff0822228aa43d32410e))


### Features

* added the new theme as a toggle for users and removed the gradient background for both dark and light modes. ([6e4ed49](https://github.com/EchonLabs/kanvaro.com/commit/6e4ed49bbc6df901edb03209f105681caadfbf6c))
* changed all page related to the Projects Module to follow the new UI color theme ([dd23adf](https://github.com/EchonLabs/kanvaro.com/commit/dd23adf030ae2b4623cfb72cbf213a2ce01a700a))
* changed the Standup Dashboard and all pages related to this feature follow the new theme. ([e183b42](https://github.com/EchonLabs/kanvaro.com/commit/e183b42ca65c9a1e227eab9ee48e6c9a29bf7700))
* final design fixes for the dashboard and updated the signout confirmation modal. ([5dc9c1c](https://github.com/EchonLabs/kanvaro.com/commit/5dc9c1c4a707e3febe651a6b481f71f7c53a495e))
* redesigned both sprint and task popup modals and and the task view page ([1eb3159](https://github.com/EchonLabs/kanvaro.com/commit/1eb31598867f336e4bdb5709e0b8b1e31676632c))
* **ui:** Added a new theme feature for users to select from a group of four premium colors as the global theme. ([039ab6f](https://github.com/EchonLabs/kanvaro.com/commit/039ab6fa51fea419e58dfb363b47ddd2e0a24619))
* updated all pages and components related to the reports module to follow the new UI theme ([13535f2](https://github.com/EchonLabs/kanvaro.com/commit/13535f24c8d96224dd4153b6e7a8ca5f70a3f77b))
* updated all pages of the Tasks Module to follow the new UI color theme ([2a1e1f0](https://github.com/EchonLabs/kanvaro.com/commit/2a1e1f0a00500127c8ee926b54d7425b3d173633))
* updated all pages of the Timer Tracking Module to fit the new UI color theme ([35ab351](https://github.com/EchonLabs/kanvaro.com/commit/35ab3512904452de34abfcc6d5d1e14a0ebe2414))
* updated all the pages in Test Management Module to follow the new UI theme. ([fc560a6](https://github.com/EchonLabs/kanvaro.com/commit/fc560a6d95256b240978e6497968411166c28a21))
* updated pages in the Settings Module to follow the new UI theme ([485851b](https://github.com/EchonLabs/kanvaro.com/commit/485851b72df0157014c733bb4494f4c9502306dd))

## [1.39.1](https://github.com/EchonLabs/kanvaro.com/compare/v1.39.0...v1.39.1) (2026-06-10)


### Bug Fixes

* harden session timeout logic and stabilize token refresh Enforce a minimum session timeout of 4 hours in SessionTimeoutWrapper ([cd59682](https://github.com/EchonLabs/kanvaro.com/commit/cd59682939a51daa3008b530ddcb12ad75c7f8dc))
* implement dynamic past time log limits Update the time tracking system to use a configurable past time limit ([f700305](https://github.com/EchonLabs/kanvaro.com/commit/f70030524ad094713d9cf80f9d5fff6a371e4bbe))
* restrict manual time logs to today and yesterday ([0afbee3](https://github.com/EchonLabs/kanvaro.com/commit/0afbee32126e86ef8fe9e31dc65c46a5870628fb))

# [1.39.0](https://github.com/EchonLabs/kanvaro.com/compare/v1.38.2...v1.39.0) (2026-06-09)


### Bug Fixes

* adjust order of elements in dashboard layout for better responsiveness ([771dacb](https://github.com/EchonLabs/kanvaro.com/commit/771dacb3860d6202dc5088000b080a57cd75cfe9))
* improve responsiveness and layout across project and calendar pages ([1b7a517](https://github.com/EchonLabs/kanvaro.com/commit/1b7a517213cee5f486ec67da3771fbda36564fd4))
* refine glassmorphism effects and transition timing Adjusted the opacity and blur intensity of Apple-inspired glass materials to improve visual depth and transparency. Additionally, introduce a custom cubic-bezier timing function and transition duration to align with premium motion standards. ([b0c897b](https://github.com/EchonLabs/kanvaro.com/commit/b0c897bdba1fd469d96f3852272753ab60d22810))
* **reports:** improve responsiveness and add date filtering to Gantt charts Update `QuickActions` component to use a dynamic grid system that adapts to the number of available actions. ([f97b15f](https://github.com/EchonLabs/kanvaro.com/commit/f97b15fe6966bc8fdf5e89ae7bfbd59968c5b27e))


### Features

* **dashboard:** redesigned the UI to fit Apple theme enhanced data aggregation and refine typography scales ([401154f](https://github.com/EchonLabs/kanvaro.com/commit/401154f42dd6978a9cfffcd6ad9ce7f1bb0f17d6))
* **ui/dashboard:** implement Apple HIG design system tokens ([7839f56](https://github.com/EchonLabs/kanvaro.com/commit/7839f5626f9aab3f12d7940560b5c2215375be0c))
* **ui:** apply Apple HIG semantic styling and component refinements to dashboard core UI Components ([f1adb0b](https://github.com/EchonLabs/kanvaro.com/commit/f1adb0b680cd1eab0758e6c4ccaf64fd74705580))
* **ui:** Implement a more sophisticated visual presentation for time tracking components and extend the manual logging functionality for administrative users. ([ae9b1f8](https://github.com/EchonLabs/kanvaro.com/commit/ae9b1f88f7ab99248a8ab3c19198173945c4709e))
* **ui:** implemented new revamped designs for all pages realted to the Time Tracking Module and added new animation styles ([c8c5440](https://github.com/EchonLabs/kanvaro.com/commit/c8c54403e59353cc832fccdee8550df3eb92c8d2))
* **ui:** implemented revamped UI to all Team Module pages ([b188b04](https://github.com/EchonLabs/kanvaro.com/commit/b188b044bd185fa9c2eda1c01ab2543ade7e829f))
* **ui:** redesign all report pages, components and the calender page with Apple-inspired design system ([76c536b](https://github.com/EchonLabs/kanvaro.com/commit/76c536bf4eda0f3d865cc0bb30a8c2705af311b4))
* **ui:** redesign standup dashboard with Apple-inspired design system ([bd97109](https://github.com/EchonLabs/kanvaro.com/commit/bd97109628b0dae55c58acf0114c07229b5ef317))
* **ui:** redesign UI and improve component structure in Test Management Module pages ([26ffcef](https://github.com/EchonLabs/kanvaro.com/commit/26ffcef4541dc7d9bf481e0b53325a81bdd9e633))
* **ui:** refactor task management pages with shared components and Apple-inspired design ([9c1f424](https://github.com/EchonLabs/kanvaro.com/commit/9c1f424a286cbeb4cea22c09e5dd91236d1762d2))
* **ui:** Update Kanban and Projects pages with new design tokens, improved typography, and refined component structures  Implement a theme switcher (Light, Dark, System) in the MobileMenu using `next-themes`. ([be4d213](https://github.com/EchonLabs/kanvaro.com/commit/be4d213f883a4e0594831da3235f0406b7f0419f))

## [1.38.2](https://github.com/EchonLabs/kanvaro.com/compare/v1.38.1...v1.38.2) (2026-06-02)

## [1.38.1](https://github.com/EchonLabs/kanvaro.com/compare/v1.38.0...v1.38.1) (2026-06-02)


### Reverts

* Revert "chore(release): 1.38.0 [skip ci]" ([01d28ce](https://github.com/EchonLabs/kanvaro.com/commit/01d28ce888238b9011c4ae8050bebf31fecfe903))
* Revert "Merge pull request [#843](https://github.com/EchonLabs/kanvaro.com/issues/843) from EchonLabs/improvments/AI-Feature-report-gen" ([5613e8a](https://github.com/EchonLabs/kanvaro.com/commit/5613e8afd36519bd49114bc11f08eb015f4b084f))

# [1.37.0](https://github.com/EchonLabs/kanvaro.com/compare/v1.36.4...v1.37.0) (2026-05-29)


### Features

* add loading component for Standup Dashboard ([e67c2e1](https://github.com/EchonLabs/kanvaro.com/commit/e67c2e1a069cb68713bc4c285bebaeb3c6b80b3a))
* add short format for logged hours in Standup Timelog utilities ([46c1a00](https://github.com/EchonLabs/kanvaro.com/commit/46c1a0090c8ecdfe590cd146379318525555d2ec))
* add Standup Assignment and Schedule dialogs with form handling ([b2e2a04](https://github.com/EchonLabs/kanvaro.com/commit/b2e2a04d852c35742876000124549e772fd5d865))
* add Standup Dashboard link to Sidebar and MobileMenu navigation ([85210ff](https://github.com/EchonLabs/kanvaro.com/commit/85210ff112affa9bbb609f1e5a1aba479584ff24))
* add standup summary page and delay reasons handling ([0e3eae9](https://github.com/EchonLabs/kanvaro.com/commit/0e3eae92f735f0db728e31686f83538911b5266b))
* add StandupSchedule model and API routes for managing standup schedules ([cefb8d7](https://github.com/EchonLabs/kanvaro.com/commit/cefb8d7640a1c35c268a08d28078458e8b2ad765))
* create Standup Schedule page with form handling and project details ([b94f381](https://github.com/EchonLabs/kanvaro.com/commit/b94f3818c78f9b0af575fb847183f66413e72177))
* enhance Standup Dashboard with detailed meeting view and local schedule management ([5596ef4](https://github.com/EchonLabs/kanvaro.com/commit/5596ef4f2174b931aea744409f55567f10351600))
* enhance Standup Dashboard with new schedule management features and improved data handling ([34b7cd1](https://github.com/EchonLabs/kanvaro.com/commit/34b7cd15c15abcbd27fa9572535ba4d209a3e1f7))
* Enhance Standup Dashboard with Unified Comments and Summary Generation ([51fd24f](https://github.com/EchonLabs/kanvaro.com/commit/51fd24ff348a56c0531db2a0a14b67592b6c1164))
* enhance standup schedule creation with task assignments and notes and added summary generation ([1e7ba04](https://github.com/EchonLabs/kanvaro.com/commit/1e7ba04086ad47bc0cae60b333aca734ff7b87f1))
* enhance standup scheduling with actual date handling and date key utilities ([7730eba](https://github.com/EchonLabs/kanvaro.com/commit/7730eba8a7b4f6a9a0fe7a08a3d50703690c110f))
* enhanced the StandupSummaryDialog to parse and display existing summaries more intelligently, including section titles and comments. ([3a92bc1](https://github.com/EchonLabs/kanvaro.com/commit/3a92bc1de5bf5f1a6a6aa71ae1376208537c9636))
* implement Standup Dashboard with project summaries and details ([e9dc33b](https://github.com/EchonLabs/kanvaro.com/commit/e9dc33bd676576d32ecd2856f6bf0f8db1139133))
* improve date handling in standup schedule and dashboard components ([e4407d0](https://github.com/EchonLabs/kanvaro.com/commit/e4407d0b2ea8adf3ff92be75d5749fcfc99134fd))
* refactor Standup Dashboard and Schedule pages for improved error handling and state management ([ebc6679](https://github.com/EchonLabs/kanvaro.com/commit/ebc66799964b0e0d29651040098d36ddd64666f1))
* update breadcrumb management in Standup Dashboard and Schedule pages for improved navigation ([4ee138d](https://github.com/EchonLabs/kanvaro.com/commit/4ee138dc4ac58732f765e00e41e1e476a786b1db))

## [1.36.4](https://github.com/EchonLabs/kanvaro.com/compare/v1.36.3...v1.36.4) (2026-05-27)


### Bug Fixes

* dashboard showing incorrect logged hours until page is refreshed. ([e0298ac](https://github.com/EchonLabs/kanvaro.com/commit/e0298acefcd42301777889167e046dbf4b27369c))
* ensure orphaned inline elements are wrapped in <p> tags for proper formatting ([f1e67af](https://github.com/EchonLabs/kanvaro.com/commit/f1e67af27c50803835bdf179177387a80146befc))
* removed access for Team Members and QA's to view reports ([d6f9b2f](https://github.com/EchonLabs/kanvaro.com/commit/d6f9b2fd4f79c264a6bf2824c43a3c4fc12a4f08))
* resolve missing organization logo and incorrect inviter/footer details; revamp welcome email design ([156090e](https://github.com/EchonLabs/kanvaro.com/commit/156090e53e385860cc43595bdd2ae1a5e6826e07))
* restrict Assignee and Creator Filters for QA Engineer Role ([7ba0e9a](https://github.com/EchonLabs/kanvaro.com/commit/7ba0e9a148bfa940c311e33972ae360a31ef080c))
* update email CTA button color for better visibility ([7c19481](https://github.com/EchonLabs/kanvaro.com/commit/7c19481a365d73be6dc0be67c600718712fe8393))
* update task title tooltip to display only the title ([368b059](https://github.com/EchonLabs/kanvaro.com/commit/368b05904d01d0837a36fa4e1c21305d4603691f))

## [1.36.3](https://github.com/EchonLabs/kanvaro.com/compare/v1.36.2...v1.36.3) (2026-05-19)


### Bug Fixes

* reports - The selected task is missing after selection. Although the results are displayed, the selected task is not shown in the task dropdown. ([0875282](https://github.com/EchonLabs/kanvaro.com/commit/087528299148a3a132915432998c2833a97e77f6))

## [1.36.2](https://github.com/EchonLabs/kanvaro.com/compare/v1.36.1...v1.36.2) (2026-05-19)


### Bug Fixes

* add edit member details permission for HR role ([a6e276c](https://github.com/EchonLabs/kanvaro.com/commit/a6e276c05c8d1fe6da916f8a864ec5709f3c0780))
* clear timer form when timer stops to refresh the timer form fields ([073a0c4](https://github.com/EchonLabs/kanvaro.com/commit/073a0c48927799ae8845a45841b349f09b55f974))
* enhance sprint modal functionality to include project context and filtering ([abf463f](https://github.com/EchonLabs/kanvaro.com/commit/abf463f774e9f1ebda30577aea37ec2fd60eca8d))
* implement text truncation for task titles in dropdowns and improve layout consistency ([4c43d21](https://github.com/EchonLabs/kanvaro.com/commit/4c43d2120c234fd016f63c54a9bfae5b6e6d3a60))
* improved smart truncation for task titles based on capital letter detection ([b7dd50e](https://github.com/EchonLabs/kanvaro.com/commit/b7dd50e407867129580f69e5b89907ebd6f436b2))
* update permissions to allow HR role to cancel invitations and restricted PM role to remove members ([c0d32d6](https://github.com/EchonLabs/kanvaro.com/commit/c0d32d642d75b96470a29b9da72bc127230d50aa))
* update user profile picture to show changes immediately when updated or removed ([1a3acb7](https://github.com/EchonLabs/kanvaro.com/commit/1a3acb79adb0b7ae41d4e15fff74d81e739020e7))

## [1.36.1](https://github.com/EchonLabs/kanvaro.com/compare/v1.36.0...v1.36.1) (2026-05-12)


### Bug Fixes

* added allowedStyles for CSS validation and improved tag handling for enhanced HTML sanitization ([3db1a63](https://github.com/EchonLabs/kanvaro.com/commit/3db1a632d8fef97845671daec8e831b42afb3451))
* added allowedStyles for CSS validation and improved tag handling for enhanced HTML sanitization ([fed8f06](https://github.com/EchonLabs/kanvaro.com/commit/fed8f06df08ead915a013db8b4b3239e2ac801ef))
* Epics Sub Module | Add Project Filter for Better Filtering ([04dbd05](https://github.com/EchonLabs/kanvaro.com/commit/04dbd056aaf0c14ce9facf252aa7ae6ba2e5a631))
* Epics Sub Module | Add Project Filter for Better Filtering ([a13046a](https://github.com/EchonLabs/kanvaro.com/commit/a13046acfd8addca2c0a4406c2f8fb57d7c2fe85))

# [1.36.0](https://github.com/EchonLabs/kanvaro.com/compare/v1.35.2...v1.36.0) (2026-05-06)


### Bug Fixes

* add a header for change section in README ([68c436e](https://github.com/EchonLabs/kanvaro.com/commit/68c436e364969df07a806e7d689465102d49011e))


### Features

* **TimeLogs, TimeReports, Timer:** enhance task handling and improve UI interactions ([febe71c](https://github.com/EchonLabs/kanvaro.com/commit/febe71c6258a05aa1a909aac479704e31536b14d))

## [1.35.2](https://github.com/EchonLabs/kanvaro.com/compare/v1.35.1...v1.35.2) (2026-05-04)


### Bug Fixes

* update timer status handling and improve timer update callback ([f0d89e9](https://github.com/EchonLabs/kanvaro.com/commit/f0d89e921b46a69e9de6f3b333e9f99665955bae))

## [1.35.1](https://github.com/EchonLabs/kanvaro.com/compare/v1.35.0...v1.35.1) (2026-04-30)


### Bug Fixes

* mark image components as unoptimized for performance improvements ([d149303](https://github.com/EchonLabs/kanvaro.com/commit/d149303c439387053426935d8758dd021873bed4))

# [1.35.0](https://github.com/EchonLabs/kanvaro.com/compare/v1.34.1...v1.35.0) (2026-04-28)


### Features

* enhance dashboard header and quick actions layout ([d0e1089](https://github.com/EchonLabs/kanvaro.com/commit/d0e1089e2f233fb15853719cae368a4c29f51284))

## [1.34.1](https://github.com/EchonLabs/kanvaro.com/compare/v1.34.0...v1.34.1) (2026-04-27)


### Bug Fixes

* refactor invitation email generation to use a dedicated HTML template function ([5fac30b](https://github.com/EchonLabs/kanvaro.com/commit/5fac30b49bab03962d1a819f571467f75c92b872))

# [1.34.0](https://github.com/EchonLabs/kanvaro.com/compare/v1.33.0...v1.34.0) (2026-04-27)


### Features

* enhance filter search inputs with focus functionality across various components ([9a401b2](https://github.com/EchonLabs/kanvaro.com/commit/9a401b283bbf1bbc059291e75f6579c8a73deecc))

# [1.33.0](https://github.com/EchonLabs/kanvaro.com/compare/v1.32.6...v1.33.0) (2026-04-23)


### Features

* Implement AuthContext for user authentication and session management ([59bd24c](https://github.com/EchonLabs/kanvaro.com/commit/59bd24c744a969a647021815260d8a36db1319e9))

## [1.32.6](https://github.com/EchonLabs/kanvaro.com/compare/v1.32.5...v1.32.6) (2026-04-22)


### Bug Fixes

* update task interface and improve timer controls for assignees ([2ea9d32](https://github.com/EchonLabs/kanvaro.com/commit/2ea9d323662372b8b1dac9ee25e3000bb017830c))

## [1.32.5](https://github.com/EchonLabs/kanvaro.com/compare/v1.32.4...v1.32.5) (2026-04-21)


### Bug Fixes

* update Swagger UI endpoint and add new API route for OpenAPI specification ([7a2f0f4](https://github.com/EchonLabs/kanvaro.com/commit/7a2f0f4ae1aefe88840834b74070022e2f31c3d6))

## [1.32.4](https://github.com/EchonLabs/kanvaro.com/compare/v1.32.3...v1.32.4) (2026-04-21)


### Bug Fixes

* add sanitize-html dependency for improved HTML sanitization ([351d015](https://github.com/EchonLabs/kanvaro.com/commit/351d01507a8ce0c96a087f06ca3ce552a69ceeb8))

## [1.32.3](https://github.com/EchonLabs/kanvaro.com/compare/v1.32.2...v1.32.3) (2026-04-21)


### Bug Fixes

* update local server URL to use HTTPS for development ([0ff3e46](https://github.com/EchonLabs/kanvaro.com/commit/0ff3e46c288426e8175daf4cf15579b5c3d5db73))

## [1.32.2](https://github.com/EchonLabs/kanvaro.com/compare/v1.32.1...v1.32.2) (2026-04-21)


### Bug Fixes

* sanitize task descriptions and improve HTML handling in task components ([845e8bc](https://github.com/EchonLabs/kanvaro.com/commit/845e8bc135ff3df9c1057e6e063c2551a76a029d))

## [1.32.1](https://github.com/EchonLabs/kanvaro.com/compare/v1.32.0...v1.32.1) (2026-04-20)


### Bug Fixes

* enforce task title word limit and improve timer management in task detail page ([852ab18](https://github.com/EchonLabs/kanvaro.com/commit/852ab184ba95b0c5e7861b2f03abc70532b9494a))

# [1.32.0](https://github.com/EchonLabs/kanvaro.com/compare/v1.31.1...v1.32.0) (2026-04-20)


### Features

* enhance time tracking widget with word truncation and improved task description display ([9fddfcd](https://github.com/EchonLabs/kanvaro.com/commit/9fddfcd265e63e1e6a9ce0abb694a92bc53fbbc0))

## [1.31.1](https://github.com/EchonLabs/kanvaro.com/compare/v1.31.0...v1.31.1) (2026-04-17)


### Bug Fixes

* add active timer functionality and improve timer management in task and time tracking components ([1762e4f](https://github.com/EchonLabs/kanvaro.com/commit/1762e4f2f0678664e4ed922e89d2e540b1e14a9b))

# [1.31.0](https://github.com/EchonLabs/kanvaro.com/compare/v1.30.14...v1.31.0) (2026-04-16)


### Bug Fixes

* implement duplicate time entry cleanup script and deduplication safety net in TimeEntry model ([254bde2](https://github.com/EchonLabs/kanvaro.com/commit/254bde24db7833fe2186001fd490137cf1f62f5f))


### Features

* enhance TestPlanForm with rich text editor and test suite management ([c39d037](https://github.com/EchonLabs/kanvaro.com/commit/c39d037be6e3a02a768baed6c5ba54a17a2beda4))

## [1.30.14](https://github.com/EchonLabs/kanvaro.com/compare/v1.30.13...v1.30.14) (2026-04-08)


### Bug Fixes

* Test management ([b05ba9a](https://github.com/EchonLabs/kanvaro.com/commit/b05ba9ae0af1b1b01344e041e2389830dfb6ede4))

## [1.30.13](https://github.com/EchonLabs/kanvaro.com/compare/v1.30.12...v1.30.13) (2026-04-07)


### Bug Fixes

* implement permission checks for income viewing and creation, restrict project and task deletions to admins, and ensure time tracking summaries reflect only the viewer's logs ([04c46d6](https://github.com/EchonLabs/kanvaro.com/commit/04c46d6dc20d6ce20fc3536dbe865e5dfca0cbb8))

## [1.30.12](https://github.com/EchonLabs/kanvaro.com/compare/v1.30.11...v1.30.12) (2026-04-06)


### Bug Fixes

* test module and budget module issue ([0bac662](https://github.com/EchonLabs/kanvaro.com/commit/0bac6628e5e3fe5cd07445938d22b1fc70753746))

## [1.30.11](https://github.com/EchonLabs/kanvaro.com/compare/v1.30.10...v1.30.11) (2026-03-31)

## [1.30.10](https://github.com/EchonLabs/kanvaro.com/compare/v1.30.9...v1.30.10) (2026-03-25)


### Bug Fixes

* improve task management UI and enhance date filtering in TimeReports ([40d14c3](https://github.com/EchonLabs/kanvaro.com/commit/40d14c3560482a48a23179c7f61a00f91d5c4752))

## [1.30.9](https://github.com/EchonLabs/kanvaro.com/compare/v1.30.8...v1.30.9) (2026-03-23)


### Bug Fixes

* enhance task search functionality and improve UI in TimeLogs and HRManualTimeLogModal ([3bd5bd6](https://github.com/EchonLabs/kanvaro.com/commit/3bd5bd68cecf0140a63a24c26e80204a177f2e21))

## [1.30.8](https://github.com/EchonLabs/kanvaro.com/compare/v1.30.7...v1.30.8) (2026-03-18)


### Bug Fixes

* improve infinite scroll handling and task search debounce ([77cec7d](https://github.com/EchonLabs/kanvaro.com/commit/77cec7d50bb290cc7c49265ca235bb780fc9629f))

## [1.30.7](https://github.com/EchonLabs/kanvaro.com/compare/v1.30.6...v1.30.7) (2026-03-16)


### Bug Fixes

* add chnges ([a0311d9](https://github.com/EchonLabs/kanvaro.com/commit/a0311d9d38da60f95fbcca9a906a016eedae3cb1))

## [1.30.6](https://github.com/EchonLabs/kanvaro.com/compare/v1.30.5...v1.30.6) (2026-03-16)


### Bug Fixes

* add chnges ([c5bd5a5](https://github.com/EchonLabs/kanvaro.com/commit/c5bd5a5391093790af2e9fed68a212d057f40f4b))

## [1.30.5](https://github.com/EchonLabs/kanvaro.com/compare/v1.30.4...v1.30.5) (2026-03-13)


### Bug Fixes

* fixing unable to version up issue ([840d4b7](https://github.com/EchonLabs/kanvaro.com/commit/840d4b7a05119f81eb4f6b1cf5b442c64a7ddf56))

## [1.30.4](https://github.com/EchonLabs/kanvaro.com/compare/v1.30.3...v1.30.4) (2026-03-05)


### Bug Fixes

* correct grammatical error in README.md for consistency ([52acc97](https://github.com/EchonLabs/kanvaro.com/commit/52acc97338c23cc5e9dc10183553195316adff56))

## [1.30.3](https://github.com/EchonLabs/kanvaro.com/compare/v1.30.2...v1.30.3) (2026-03-04)


### Bug Fixes

* correct minor grammatical errors and improve formatting in README.md ([2a8570e](https://github.com/EchonLabs/kanvaro.com/commit/2a8570e663af5fa878c8aea47c5c1a94ea341fac))

# [1.6.0](https://github.com/EchonLabs/kanvaro.com/compare/v1.5.0...v1.6.0) (2025-11-25)


### Bug Fixes

* add fixes ([6b189cd](https://github.com/EchonLabs/kanvaro.com/commit/6b189cd0c1a20f97a5d4855ff3305ec247cfb1e7))


### Features

* add new changes ([d5aa060](https://github.com/EchonLabs/kanvaro.com/commit/d5aa06082c87869239159eca1cf6511d93604f1b))

# [1.5.0](https://github.com/EchonLabs/kanvaro.com/compare/v1.4.6...v1.5.0) (2025-11-25)


### Features

* add landing page changes ([93feaea](https://github.com/EchonLabs/kanvaro.com/commit/93feaea0dd54084295c2ff578402f516e93d9433))

## [1.4.6](https://github.com/EchonLabs/kanvaro.com/compare/v1.4.5...v1.4.6) (2025-11-25)


### Bug Fixes

* add bug fixes in time ([ff14233](https://github.com/EchonLabs/kanvaro.com/commit/ff142331369200576963dfd20ac6268a49820bb8))

## [1.4.5](https://github.com/EchonLabs/kanvaro.com/compare/v1.4.4...v1.4.5) (2025-11-24)


### Bug Fixes

* add fixes ([00ece98](https://github.com/EchonLabs/kanvaro.com/commit/00ece9879648643ed8be72274b8863909727015f))

## [1.4.4](https://github.com/EchonLabs/kanvaro.com/compare/v1.4.3...v1.4.4) (2025-11-24)


### Bug Fixes

* add consoles to check vconfig ([3b56214](https://github.com/EchonLabs/kanvaro.com/commit/3b5621401fdd5ad14275992ad36a6a52197f3052))

## [1.4.3](https://github.com/EchonLabs/kanvaro.com/compare/v1.4.2...v1.4.3) (2025-11-24)


### Bug Fixes

* add sprint changes ([e13df8d](https://github.com/EchonLabs/kanvaro.com/commit/e13df8de73431053108c7644de3af37eb1b3cf0a))

## [1.4.2](https://github.com/EchonLabs/kanvaro.com/compare/v1.4.1...v1.4.2) (2025-11-24)


### Bug Fixes

* update git ignore file ([a909808](https://github.com/EchonLabs/kanvaro.com/commit/a909808be4ae566afbb6a8120eed2fd767e108f1))

## [1.4.1](https://github.com/EchonLabs/kanvaro.com/compare/v1.4.0...v1.4.1) (2025-11-24)


### Bug Fixes

* add config.json ([cd9fae5](https://github.com/EchonLabs/kanvaro.com/commit/cd9fae5077a58d4f122816dd2a2c66ed20f9d592))

# [1.4.0](https://github.com/EchonLabs/kanvaro.com/compare/v1.3.1...v1.4.0) (2025-11-22)


### Features

* add latest changes in sprint ([0ccc14a](https://github.com/EchonLabs/kanvaro.com/commit/0ccc14a15a3db79226b879c65af537be109c445e))

## [1.3.1](https://github.com/EchonLabs/kanvaro.com/compare/v1.3.0...v1.3.1) (2025-11-21)


### Bug Fixes

* fix create task ([3f71760](https://github.com/EchonLabs/kanvaro.com/commit/3f71760754cad7ad487963a1af8c9d9d0ff13d49))

# [1.3.0](https://github.com/EchonLabs/kanvaro.com/compare/v1.2.4...v1.3.0) (2025-11-21)


### Bug Fixes

* speedup task creation ([fe8bf85](https://github.com/EchonLabs/kanvaro.com/commit/fe8bf854a7e6a9f28675b4ec2b79a170bdbb729d))


### Features

* add sprint changes ([c8afe33](https://github.com/EchonLabs/kanvaro.com/commit/c8afe33c4e2f9b194096a498a785dede90474f7f))

## [1.2.4](https://github.com/EchonLabs/kanvaro.com/compare/v1.2.3...v1.2.4) (2025-11-21)


### Bug Fixes

* add consoles to check errors ([cc19cc4](https://github.com/EchonLabs/kanvaro.com/commit/cc19cc4bb95d307af0aa8dc96af53009e258a194))

## [1.2.3](https://github.com/EchonLabs/kanvaro.com/compare/v1.2.2...v1.2.3) (2025-11-21)


### Bug Fixes

* kanbarn board loading issue ([c8b55e8](https://github.com/EchonLabs/kanvaro.com/commit/c8b55e8346766f70a8534ff93f95e827861a71e9))
* remove settings part from stories ([f0d0fef](https://github.com/EchonLabs/kanvaro.com/commit/f0d0fefa916f858a295ffe50e645c7c67f31d6df))

## [1.2.2](https://github.com/EchonLabs/kanvaro.com/compare/v1.2.1...v1.2.2) (2025-11-21)


### Bug Fixes

* add changes in invitation and email ([f8a4843](https://github.com/EchonLabs/kanvaro.com/commit/f8a48436c72cba3813887c85c9a336fe4dab1b79))

## [1.2.1](https://github.com/EchonLabs/kanvaro.com/compare/v1.2.0...v1.2.1) (2025-11-21)


### Bug Fixes

* add backlog to kanbarn board ([bb3c561](https://github.com/EchonLabs/kanvaro.com/commit/bb3c561e549aeac102d286bd767ab1b51b71ac82))

# [1.2.0](https://github.com/EchonLabs/kanvaro.com/compare/v1.1.16...v1.2.0) (2025-11-20)


### Features

* add title case ([2ce0e67](https://github.com/EchonLabs/kanvaro.com/commit/2ce0e673f0173cd58528aeb90746f1d00b9368d4))

## [1.1.16](https://github.com/EchonLabs/kanvaro.com/compare/v1.1.15...v1.1.16) (2025-11-20)


### Bug Fixes

* add title cases ([9bdedef](https://github.com/EchonLabs/kanvaro.com/commit/9bdedeff48f56cc4643d2031c3c274c7efbcd321))

## [1.1.15](https://github.com/EchonLabs/kanvaro.com/compare/v1.1.14...v1.1.15) (2025-11-20)


### Bug Fixes

* add changes in calender view ([c106bba](https://github.com/EchonLabs/kanvaro.com/commit/c106bba7ff6433fe09a7e69ff1947d6d71cd67ca))
* due data is not older date ([82c26b3](https://github.com/EchonLabs/kanvaro.com/commit/82c26b3ecf645badbfc44704a7c3c3355b19d6a4))

## [1.1.14](https://github.com/EchonLabs/kanvaro.com/compare/v1.1.13...v1.1.14) (2025-11-20)


### Bug Fixes

* add time tracking fixes ([c0769d3](https://github.com/EchonLabs/kanvaro.com/commit/c0769d30d32ccc14dbbfc2466b9d9c2590560584))
* fix task issues ([96b8b1f](https://github.com/EchonLabs/kanvaro.com/commit/96b8b1f3551b38ae0482d0c08ea3d91d8b2d1f6b))

## [1.1.13](https://github.com/EchonLabs/kanvaro.com/compare/v1.1.12...v1.1.13) (2025-11-20)


### Bug Fixes

* add task edit new changes ([2b1641a](https://github.com/EchonLabs/kanvaro.com/commit/2b1641aecbd86bb86d40eb6e7859487e768b7f72))
* stories edit flow ([1fdb6e8](https://github.com/EchonLabs/kanvaro.com/commit/1fdb6e83190b980beaf4b65530748c806e2f4a4f))

## [1.1.12](https://github.com/EchonLabs/kanvaro.com/compare/v1.1.11...v1.1.12) (2025-11-19)


### Bug Fixes

* fix build issue ([0571870](https://github.com/EchonLabs/kanvaro.com/commit/05718705398a5e4d6b8af328b27518a66540abe0))

## [1.1.11](https://github.com/EchonLabs/kanvaro.com/compare/v1.1.10...v1.1.11) (2025-11-19)


### Bug Fixes

* add changes in kanbarn board ([fb1d208](https://github.com/EchonLabs/kanvaro.com/commit/fb1d2087dd5b09aafc7b964e7bfbf1b1e8a6a0b8))
* add changes in project setting ([e3640a9](https://github.com/EchonLabs/kanvaro.com/commit/e3640a962255b340c695456f89264846b5118042))
* add chnges in assigned to section ([35c524a](https://github.com/EchonLabs/kanvaro.com/commit/35c524a3f84b07c9f6fccb8df5995a599618d71f))
* add project and task changes ([20eef34](https://github.com/EchonLabs/kanvaro.com/commit/20eef34226a333f1e9ccfb0053e48391352e8db5))

## [1.1.10](https://github.com/EchonLabs/kanvaro.com/compare/v1.1.9...v1.1.10) (2025-11-11)


### Bug Fixes

* :bug: revert signup changes ([ba80157](https://github.com/EchonLabs/kanvaro.com/commit/ba80157ac9545497de38f4afa3c985160b084453))

## [1.1.9](https://github.com/EchonLabs/kanvaro.com/compare/v1.1.8...v1.1.9) (2025-11-11)


### Reverts

* Revert "fix: debug issues in dev" ([a157140](https://github.com/EchonLabs/kanvaro.com/commit/a15714057a88e271b1a9fbf8af8ddc17c597e9ff))

## [1.1.8](https://github.com/EchonLabs/kanvaro.com/compare/v1.1.7...v1.1.8) (2025-11-11)


### Bug Fixes

* debug issues in dev ([42de66a](https://github.com/EchonLabs/kanvaro.com/commit/42de66a1b10ac7e3f913912aaf5c9e511fa44944))

## [1.1.7](https://github.com/EchonLabs/kanvaro.com/compare/v1.1.6...v1.1.7) (2025-11-11)


### Bug Fixes

* fix bugs in sign up ([2c2977b](https://github.com/EchonLabs/kanvaro.com/commit/2c2977bbf94a62fb4436dd8515f6ca156f16efda))

## [1.1.6](https://github.com/EchonLabs/kanvaro.com/compare/v1.1.5...v1.1.6) (2025-11-11)


### Bug Fixes

* reverting config changes ([c9ef665](https://github.com/EchonLabs/kanvaro.com/commit/c9ef6655093875f395f4a646239228006db0a915))

## [1.1.5](https://github.com/EchonLabs/kanvaro.com/compare/v1.1.4...v1.1.5) (2025-11-11)


### Bug Fixes

* fix always redirect to setup issue ([578f821](https://github.com/EchonLabs/kanvaro.com/commit/578f82140e5328295c8301ee504a5faa5e1754c0))

## [1.1.4](https://github.com/EchonLabs/kanvaro.com/compare/v1.1.3...v1.1.4) (2025-11-10)


### Bug Fixes

* :bug: add backlog  fixes ([34671b9](https://github.com/EchonLabs/kanvaro.com/commit/34671b975a28d7c9c8f4895a25c86fa9c5c8f9fe))
* add changes in filters in backlog ([3d5ef17](https://github.com/EchonLabs/kanvaro.com/commit/3d5ef170386092a170231f572e5ef76689e6d07c))
* add mobile responsive in set up ([685b2a9](https://github.com/EchonLabs/kanvaro.com/commit/685b2a93a8fdf28af7af1713e24d223e951c3ef1))
* add time log issues ([9e14a90](https://github.com/EchonLabs/kanvaro.com/commit/9e14a906cff3c5e35247cb8d92cb7107cff8f3b7))

## [1.1.3](https://github.com/EchonLabs/kanvaro.com/compare/v1.1.2...v1.1.3) (2025-11-10)


### Bug Fixes

* undo changes ([3251a2f](https://github.com/EchonLabs/kanvaro.com/commit/3251a2f5e01c520fff03305a37275faf05ede4de))

## [1.1.2](https://github.com/EchonLabs/kanvaro.com/compare/v1.1.1...v1.1.2) (2025-11-10)


### Bug Fixes

* add git ignore chnages ([768075c](https://github.com/EchonLabs/kanvaro.com/commit/768075cbb1f66f10a983c4bae8530db4a84f43db))

## [1.1.1](https://github.com/EchonLabs/kanvaro.com/compare/v1.1.0...v1.1.1) (2025-11-10)


### Bug Fixes

* add to spritn option in backlog tasks ([2854f5f](https://github.com/EchonLabs/kanvaro.com/commit/2854f5f06dc810b4f6ee48455c1768046133b76b))
* fix timer filtering issues ([224ebc3](https://github.com/EchonLabs/kanvaro.com/commit/224ebc3406aba2e6f0e06e89c784cdcf6d460038))
* fix version number issue and sign in ([1a2af46](https://github.com/EchonLabs/kanvaro.com/commit/1a2af460a438d63b420a953a8fe024f9781c0a94))
* role error msg will lead to scroll the page up ([000ff25](https://github.com/EchonLabs/kanvaro.com/commit/000ff25cefe945ce7b803dc1d5f64be7b800fedb))

# [1.1.0](https://github.com/EchonLabs/kanvaro.com/compare/v1.0.25...v1.1.0) (2025-11-07)


### Features

* add changes in time tracking ([e565d08](https://github.com/EchonLabs/kanvaro.com/commit/e565d087e0f8c19c2d97bff9621d46e997ab4149))

## [1.0.25](https://github.com/EchonLabs/kanvaro.com/compare/v1.0.24...v1.0.25) (2025-11-07)


### Bug Fixes

* add git ignore chnges ([4af2dac](https://github.com/EchonLabs/kanvaro.com/commit/4af2dacc310e37ba79dbf1c14c075eddf75263fa))

## [1.0.24](https://github.com/EchonLabs/kanvaro.com/compare/v1.0.23...v1.0.24) (2025-11-06)


### Bug Fixes

* add fixes ([69b1886](https://github.com/EchonLabs/kanvaro.com/commit/69b1886a9f058b362e1eb3ad8145f6251a08e8c0))

## [1.0.23](https://github.com/EchonLabs/kanvaro.com/compare/v1.0.22...v1.0.23) (2025-11-06)


### Bug Fixes

* fix bugs ([8415e24](https://github.com/EchonLabs/kanvaro.com/commit/8415e24751d3ba71af357374d12b48063e694cc9))

## [1.0.22](https://github.com/EchonLabs/kanvaro.com/compare/v1.0.21...v1.0.22) (2025-11-05)


### Bug Fixes

* organization bug fixes ([122280b](https://github.com/EchonLabs/kanvaro.com/commit/122280b2c664168a9de4e84f29a2625ea337dfac))

## [1.0.21](https://github.com/EchonLabs/kanvaro.com/compare/v1.0.20...v1.0.21) (2025-11-04)


### Bug Fixes

* add fixes for build fail ([bcf00bb](https://github.com/EchonLabs/kanvaro.com/commit/bcf00bb42f6e65476629a7034621bac12992d017))

## [1.0.20](https://github.com/EchonLabs/kanvaro.com/compare/v1.0.19...v1.0.20) (2025-11-04)


### Bug Fixes

* add changes for timer change ([ee4d1c0](https://github.com/EchonLabs/kanvaro.com/commit/ee4d1c09b9bc3e115847d7953634fc377426e934))

## [1.0.19](https://github.com/EchonLabs/kanvaro.com/compare/v1.0.18...v1.0.19) (2025-11-04)


### Bug Fixes

* :bug: fix images not retriving issue ([003d8b6](https://github.com/EchonLabs/kanvaro.com/commit/003d8b6e4e5b98d91482e150fa95929055700c11))

## [1.0.18](https://github.com/EchonLabs/kanvaro.com/compare/v1.0.17...v1.0.18) (2025-11-03)


### Bug Fixes

* :bug: add changes for profile upload issue ([e12f749](https://github.com/EchonLabs/kanvaro.com/commit/e12f749d9a1180d3af2e9d58cac18a887c8c2aeb))

## [1.0.17](https://github.com/EchonLabs/kanvaro.com/compare/v1.0.16...v1.0.17) (2025-11-03)


### Bug Fixes

* add changes ([c3f7ba6](https://github.com/EchonLabs/kanvaro.com/commit/c3f7ba6fc75c8fcec8a9803855f39d84fcc0455c))

## [1.0.16](https://github.com/EchonLabs/kanvaro.com/compare/v1.0.15...v1.0.16) (2025-11-03)


### Bug Fixes

* fix images not saving issue ([5b09460](https://github.com/EchonLabs/kanvaro.com/commit/5b0946038681daedbdf99d7f5893af36f6b1d864))

## [1.0.15](https://github.com/EchonLabs/kanvaro.com/compare/v1.0.14...v1.0.15) (2025-11-03)


### Bug Fixes

* add chnges for task ([e909412](https://github.com/EchonLabs/kanvaro.com/commit/e9094126e0c6ac4acb2e78a111e243565f785815))

## [1.0.14](https://github.com/EchonLabs/kanvaro.com/compare/v1.0.13...v1.0.14) (2025-10-31)


### Bug Fixes

* :bug: fix responsive issue ([5e06dcd](https://github.com/EchonLabs/kanvaro.com/commit/5e06dcd6c01ccec4afae8c1884d240ce73f91091))
* add changes ([9cb4c8d](https://github.com/EchonLabs/kanvaro.com/commit/9cb4c8deeffbd39858a31c34299c135bb9d77511))
* add changes ([0b99af3](https://github.com/EchonLabs/kanvaro.com/commit/0b99af3bcfc52ff1e130c82cd47b9c7ab8bc3f11))

## [1.0.13](https://github.com/EchonLabs/kanvaro.com/compare/v1.0.12...v1.0.13) (2025-10-30)


### Bug Fixes

* add changes fro bug fixes ([cbcce02](https://github.com/EchonLabs/kanvaro.com/commit/cbcce02175ab0e5769392eb4a6792fed2efb2982))

## [1.0.12](https://github.com/EchonLabs/kanvaro.com/compare/v1.0.11...v1.0.12) (2025-10-30)


### Bug Fixes

* bugfixes for task module ([935ba0d](https://github.com/EchonLabs/kanvaro.com/commit/935ba0d67856cad040c42fec8e8d93ae3f4ee206))

## [1.0.11](https://github.com/EchonLabs/kanvaro.com/compare/v1.0.10...v1.0.11) (2025-10-30)


### Bug Fixes

* Fixing unable to version update in package.json ([8858774](https://github.com/EchonLabs/kanvaro.com/commit/885877434b9989bd09e1f5dcd2d8d97efd3d31e8))
* Fixing unable to version update in package.json ([5e1de79](https://github.com/EchonLabs/kanvaro.com/commit/5e1de79929f446f0618a87fc058a9fe309ce2277))
* Fixing unable to version update in package.json ([9b3055e](https://github.com/EchonLabs/kanvaro.com/commit/9b3055ed9504c2d821153155d54e087bf136ebb9))

## [1.0.10](https://github.com/EchonLabs/kanvaro.com/compare/v1.0.9...v1.0.10) (2025-10-30)


### Bug Fixes

* Fixing unable to version update in package.json ([1584199](https://github.com/EchonLabs/kanvaro.com/commit/158419932d40bea282569f84ebbdf007708b248b))
* Fixing unable to version update in package.json ([3bf1160](https://github.com/EchonLabs/kanvaro.com/commit/3bf1160f346d8262dad2f199b4b359f22fb07a8e))
* Fixing unable to version update in package.json ([7bc7daf](https://github.com/EchonLabs/kanvaro.com/commit/7bc7dafeb8b427502e205ed8ad523fe53a4d01f1))
* Fixing unable to version update in package.json ([9c41021](https://github.com/EchonLabs/kanvaro.com/commit/9c4102150875ecfd20c960c023b037566ace7a9d))
* Fixing unable to version update in package.json ([22f04fd](https://github.com/EchonLabs/kanvaro.com/commit/22f04fdbdf284f3c424191606b6c8e6b2ffb01e2))
* Fixing unable to version update in package.json ([43a64a5](https://github.com/EchonLabs/kanvaro.com/commit/43a64a5050e1e0422d7b60a740b3c9c523586d7a))
* Fixing unable to version update in package.json ([8308302](https://github.com/EchonLabs/kanvaro.com/commit/8308302c2fca00c22c84bf076eab47eee761bea0))
