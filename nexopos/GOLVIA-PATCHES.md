# Golvia Patches

## PHPUnit platform-contract discovery

- Upstream file: `phpunit.xml`.
- Reason: upstream uses a fixed filename-suffix allowlist for `tests/Feature`, which excluded `tests/Feature/Golvia/PlatformContractTest.php`; the contract test must run through both generic filter and full-suite commands.
- Patch: the dedicated `Golvia` suite scans only `./tests/Feature/Golvia` files ending in `Test.php`; existing upstream suites remain unchanged.
- Regression command: `php artisan test --filter=PlatformContractTest --no-coverage` (run with the documented local PHP extension setup where required).
- Upgrade review: when updating the upstream PHPUnit configuration, preserve this isolated suite or migrate the Golvia contract test to the upstream-supported discovery mechanism, then rerun the regression command and full suite.
