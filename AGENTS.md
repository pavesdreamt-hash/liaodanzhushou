# Project delivery rules

## Confirmed UI baseline and change control

- Before changing any application UI, read `CONFIRMED-UI-BASELINE.md`. The user's newest explicit instruction takes precedence; update the affected baseline clause when a new requirement is given, and record the allowed scope and protected neighboring elements before or as part of implementation. A discussion-only request does not authorize application code changes.
- Treat the baseline as the target design, not as proof that the current build already complies. Preserve confirmed structure, typography, icons, sizing, positions, interactions, data, and unaffected pages. Do not copy a known current defect or an older conflicting mockup into the baseline.
- After a UI change, inspect the actual changed files and run the relevant application checks. Compare the resulting UI and behavior against the baseline across affected layouts; restore accidental unrelated changes before delivery. Record what passed and what remains unverified. Do not delegate screenshot comparisons or regression detection to the user.
- Before calling a UI page complete, check every confirmed baseline item for that page in a freshly extracted final package. Mark each as passed, failed, or not checked; not checked is not passed. A targeted fix may be delivered only as a clearly labeled partial fix while any known mismatch remains. Put the remaining mismatch in the opening delivery paragraph, not only in a buried limitation. Do not use a successful targeted test to claim full-page acceptance.
- In particular, the 1.0.12 phone bottom fails `CONFIRMED-UI-BASELINE.md` P1–P4: its large English textarea and “待发送” row are not the approved short white field and purple airplane. Do not mark the phone page accepted until the next explicitly authorized code change fixes and verifies those checks on the final packaged App. Do not silently alter that area during a different scoped task.
- For every completed task, actually re-read `CONFIRMED-UI-BASELINE.md` and this `AGENTS.md`, compare the work and final deliverable with their applicable rules, and record any failed or unchecked item honestly. Only after that real check, end the final user response with the exact sentence **“已真实核验基准文档和项目规则”**. This sentence is a personal verification claim, never an automatic footer; if the check was not performed, do not claim completion or append it.
- Documentation-only baseline updates do not change the application version or require packaging; application changes still follow the release and handoff rules below.

## Release and handoff

- The existing 1.0.10, 1.0.11 and 1.0.12 packages keep their real historical versions; the user does not want them rebuilt or renamed. Version 1.1.0 is the separate empty WhatsApp connection edition; 1.1.1 isolates page styles, 1.1.2 restores order entry, 1.1.3 fixes local versus international phone matching, 1.1.4 restores workbench order cards, and 1.1.5 restores the six previously blanked business pages. The next completed application release is 1.1.6. Do not create 1.0.13. Keep each new release's displayed, package, bundled, and ZIP versions identical; never merely rename a ZIP or App to imply a different internal version.
- Keep the version synchronized in package metadata, the interface, the user guide, and release notes.
- Do not call an application change complete after editing source files. Run the relevant automated checks, build the current Mac x64 application in the user-requested format, extract or mount the final artifact, verify that copy launches, and confirm the displayed version. The current delivery plan uses ZIP; change to DMG only when requested. Neither format substitutes for startup verification.
- Deliver the exact artifact path, checksum, test result, Git status, opening instructions, and a concise usage guide. Normal use must start by opening the App, without a .command launcher or a mandatory evaluation database.
- The user must not need to inspect source code, find build output, or work out how to launch the application.
- If packaging is blocked, do not substitute an older artifact. Report the blocker and identify the last verified usable release.
- Use disposable fictional data for automated destructive, migration, and fault-injection tests; the user must not operate a special isolated test edition. Do not collect real KDocs data or write Google Sheets. Access to normal user data follows the user's explicit scope and applicable approvals, without proactively clearing data.
- The user has authorized bounded connection verification: read only a user-confirmed WhatsApp chat and time range, never send messages, and use only fictional material for real AI development requests. Keep credentials in local secure storage. Initial AI verification is limited to 5 requests total, 20 seconds per request, with no automatic retry.

## Current staged work

- Follow DELIVERY-PLAN.md and PHASE-01-CONNECTION-DESIGN.md. Preserve all pre-existing worktree and index changes.
- Distinguish configured, authenticated, target-confirmed, and read-verified states. A mock response or configured adapter is not a successful real connection.
- Stop dependent work at an outstanding human gate; do not ask the user to repeatedly run routine tests. Continue only independent work within the current requested phase.
- Documentation, baseline capture, and environment checks alone do not change the application version or require a new application package. Do not reissue the unchanged App as a new release.
