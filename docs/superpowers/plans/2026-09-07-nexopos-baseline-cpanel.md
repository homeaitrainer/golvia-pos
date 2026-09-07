# NexoPOS Baseline and cPanel Preflight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a reproducible NexoPOS 6.2.2 baseline, prove whether the existing cPanel account can run it safely, and deploy an access-controlled staging installation at `pos.golvia.my` using the current empty database.

**Architecture:** The existing `pos-app/` remains untouched as a legacy reference. NexoPOS 6.2.2 is imported under `nexopos/` with an upstream-tracking record, while deployment-specific checks and instructions live under `ops/cpanel/`. The current `proper15_golvia` database is staging-only; a new production database will be created at cutover.

**Tech Stack:** NexoPOS 6.2.2, Laravel 12, PHP 8.2+, MySQL 8.4 or MariaDB 10.11, Vue, Tailwind CSS, Vite, Node.js 24 for asset builds, Composer 2, Apache, cPanel Cron, PHPUnit 11, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-07-golvia-nexopos-platform-design.md`

## Global Constraints

- Keep NexoPOS core unmodified unless a documented extension gap makes a minimal patch unavoidable.
- Pin the baseline to the immutable upstream tag `v6.2.2`; do not build from `master`.
- Preserve the upstream license, copyright, and notices exactly as shipped by the pinned tag.
- Treat the mismatch between the repository's public license label and the pinned `composer.json` license field as a release gate until the tag's `LICENSE` file is read and recorded.
- Never commit `.env`, database passwords, cPanel passwords, API keys, application keys, session cookies, or database exports.
- Use `Asia/Kuala_Lumpur`, MYR, HTTPS, and server-side authorization.
- Do not expose the Laravel project root; the web document root must resolve to `nexopos/public` only.
- Do not use the current empty `proper15_golvia` database as the final production database.
- Do not migrate current GOLVIA customers, orders, coins, or vouchers.
- Do not implement membership behavior in this plan; the baseline must pass before the membership plan starts.

## Plan Series

This is plan 1 of the approved platform design. Later plans are created only after this baseline exposes the exact NexoPOS extension points and passes its acceptance gate:

1. NexoPOS baseline and cPanel preflight - this plan
2. Membership configuration, accounts, tiers, and coin ledger
3. Voucher definitions, monthly issuance, birthday issuance, and scheduler
4. Checkout pricing, atomic reward processing, and concurrency
5. Full and partial refund reward reversals
6. Customer CRM, consent, and WhatsApp/email communication
7. Quotation, SST, invoice, receipt, and MyInvois readiness
8. Product importer, stock reconciliation, branding, and production cutover

## File Map

| Path | Responsibility |
|---|---|
| `nexopos/` | Vendored NexoPOS 6.2.2 application source tracked from upstream |
| `nexopos/UPSTREAM.md` | Exact upstream URL, tag, commit, import method, license observation, and update procedure |
| `nexopos/tests/Feature/Golvia/PlatformContractTest.php` | Executable assertions for the pinned framework and module-extension contract |
| `ops/cpanel/preflight.php` | Read-only CLI inventory and compatibility check for the actual cPanel host |
| `ops/cpanel/src/PreflightEvaluator.php` | Pure compatibility rules used by the CLI and its tests |
| `ops/cpanel/tests/PreflightEvaluatorTest.php` | Unit tests for passing and failing hosting inventories |
| `ops/cpanel/cpanel-preflight.json.example` | Safe example of preflight output with no credentials |
| `ops/cpanel/DEPLOYMENT.md` | Secure cPanel layout, environment, cron, SSL, backup, and rollback instructions |
| `docs/verification/nexopos-baseline.md` | Completed evidence for local tests, hosting checks, staging smoke tests, and go/no-go decision |

---

### Task 1: Import and Record the Pinned NexoPOS Baseline

**Files:**
- Create: `nexopos/` from upstream tag `v6.2.2`
- Create: `nexopos/UPSTREAM.md`
- Verify: `nexopos/LICENSE`
- Verify: `nexopos/composer.json`
- Verify: `nexopos/composer.lock`

**Interfaces:**
- Consumes: official upstream Git repository `https://github.com/Blair2004/NexoPOS.git`, tag `v6.2.2`
- Produces: a source tree at `nexopos/` pinned to commit `6061a93cf2d3fa0e0fb2896873315485fccc4ba1` with an update procedure

- [ ] **Step 1: Confirm the worktree contains no overlapping `nexopos/` path**

Run:

```powershell
git -c safe.directory=C:/Users/Admin/Documents/Golvia status --short
Test-Path nexopos
```

Expected: `Test-Path` prints `False`. Existing unrelated user changes remain untouched.

- [ ] **Step 2: Fetch the exact upstream tag and verify that it resolves**

Run:

```powershell
git remote get-url nexopos-upstream
```

Expected before first setup: FAIL because the remote does not exist.

Then run:

```powershell
git remote add nexopos-upstream https://github.com/Blair2004/NexoPOS.git
git fetch nexopos-upstream tag v6.2.2
git rev-parse v6.2.2^{commit}
```

Expected: the final command prints a 40-character commit hash.

Verified planning-time value: `6061a93cf2d3fa0e0fb2896873315485fccc4ba1`.

- [ ] **Step 3: Import the tag without creating a nested Git repository**

Run:

```powershell
git subtree add --prefix=nexopos nexopos-upstream v6.2.2 --squash
```

Expected: `nexopos/artisan`, `nexopos/composer.json`, `nexopos/LICENSE`, and `nexopos/package.json` exist; `nexopos/.git` does not exist.

- [ ] **Step 4: Verify the pinned technical contract before adding GOLVIA files**

Run:

```powershell
Select-String -Path nexopos/composer.json -Pattern '"php": "\^8\.2\.0"','"laravel/framework": "\^12\.0"','"Modules\\\\": "modules/"'
Select-String -Path nexopos/package.json -Pattern '"node": "24\.x"'
Get-FileHash nexopos/LICENSE,nexopos/composer.lock -Algorithm SHA256
```

Expected: all four dependency/autoload patterns match and both hashes print.

- [ ] **Step 5: Read and record the actual tag license**

Create `nexopos/UPSTREAM.md` with this exact content:

```markdown
# NexoPOS Upstream Record

## Source

- Repository: https://github.com/Blair2004/NexoPOS
- Imported tag: v6.2.2
- Imported commit: 6061a93cf2d3fa0e0fb2896873315485fccc4ba1
- Import method: git subtree with squash under nexopos

## Runtime contract

- PHP: ^8.2.0
- Laravel: ^12.0
- Node.js for source asset builds: 24.x
- Module namespace: Modules mapped to modules

## License verification

The authoritative license for this imported source is the complete text in LICENSE at the imported tag. The composer.json metadata and GitHub repository label are secondary metadata and do not replace the LICENSE text. Get-FileHash is used during import review to make later comparisons reproducible.

No GOLVIA release may remove the upstream license or copyright notices. If the LICENSE text and repository metadata imply conflicting obligations, distribution pauses for legal review.

## Updating

Fetch a proposed stable tag from nexopos-upstream, inspect its release notes and license, then merge it into a disposable upgrade branch with git subtree pull. Run the platform contract, upstream tests, GOLVIA module tests, migrations, and cashier acceptance suite before production deployment.
```

Expected: the document contains no passwords, session values, or cPanel credentials.

- [ ] **Step 6: Check the imported tree and commit the upstream record**

Run:

```powershell
git -c safe.directory=C:/Users/Admin/Documents/Golvia diff --check
git -c safe.directory=C:/Users/Admin/Documents/Golvia status --short
```

Expected: no whitespace errors; `nexopos/UPSTREAM.md` is the only post-subtree uncommitted file from this task.

Commit:

```powershell
git add nexopos/UPSTREAM.md
git commit -m "docs: record pinned NexoPOS upstream"
```

---

### Task 2: Protect the NexoPOS Platform Contract with a Test

**Files:**
- Create: `nexopos/tests/Feature/Golvia/PlatformContractTest.php`

**Interfaces:**
- Consumes: `nexopos/composer.json` and `nexopos/package.json`
- Produces: PHPUnit test `Tests\Feature\Golvia\PlatformContractTest` that detects accidental framework, PHP, Node, or module-autoload drift

- [ ] **Step 1: Write the failing contract test**

Create `nexopos/tests/Feature/Golvia/PlatformContractTest.php`:

```php
<?php

namespace Tests\Feature\Golvia;

use Tests\TestCase;

class PlatformContractTest extends TestCase
{
    public function test_pinned_nexopos_runtime_and_module_contract(): void
    {
        $composer = json_decode(
            file_get_contents(base_path('composer.json')),
            true,
            flags: JSON_THROW_ON_ERROR
        );
        $package = json_decode(
            file_get_contents(base_path('package.json')),
            true,
            flags: JSON_THROW_ON_ERROR
        );

        $this->assertSame('^8.2.0', $composer['require']['php']);
        $this->assertSame('^12.0', $composer['require']['laravel/framework']);
        $this->assertSame('modules/', $composer['autoload']['psr-4']['Modules\\']);
        $this->assertSame('24.x', $package['engines']['node']);
        $this->assertFileExists(base_path('LICENSE'));
        $this->assertFileExists(base_path('UPSTREAM.md'));
    }
}
```

- [ ] **Step 2: Run the test before Composer dependencies exist**

Run from `nexopos/`:

```powershell
php artisan test --filter=PlatformContractTest
```

Expected: FAIL because `vendor/autoload.php` is not installed yet. This confirms the baseline still requires a reproducible dependency installation.

- [ ] **Step 3: Install locked PHP dependencies without production scripts**

Run from `nexopos/` with Composer 2 and the PHP binary selected for the target runtime:

```powershell
composer install --no-interaction --prefer-dist --no-scripts
```

Expected: Composer installs the exact lock-file dependency graph and `composer check-platform-reqs` reports any missing local extensions explicitly.

- [ ] **Step 4: Create an ignored local test environment**

Run from `nexopos/`:

```powershell
Copy-Item .env.example .env
if (-not (Test-Path database/database.sqlite)) { New-Item database/database.sqlite -ItemType File }
php artisan key:generate
```

Expected: `.env` and `database/database.sqlite` exist locally and remain ignored by Git; `APP_KEY` is generated only for local testing.

- [ ] **Step 5: Run the contract test**

Run:

```powershell
php artisan test --filter=PlatformContractTest
```

Expected: PASS with one test and six assertions.

- [ ] **Step 6: Run the upstream PHP test suite**

Run:

```powershell
php artisan test
```

Expected: all upstream tests pass. Record any environment-only skip; do not silently accept failures.

- [ ] **Step 7: Commit the contract test**

```powershell
git add nexopos/tests/Feature/Golvia/PlatformContractTest.php
git commit -m "test: pin NexoPOS platform contract"
```

---

### Task 3: Build a Testable cPanel Preflight Evaluator

**Files:**
- Create: `ops/cpanel/src/PreflightEvaluator.php`
- Create: `ops/cpanel/tests/PreflightEvaluatorTest.php`
- Create: `ops/cpanel/phpunit.xml`

**Interfaces:**
- Consumes: associative inventory array with `php_version`, `extensions`, `database_driver`, `database_version`, `commands`, `paths`, `cron_available`, `ssl_available`, and `url_rewrite_available`
- Produces: `Golvia\Cpanel\PreflightEvaluator::evaluate(array $inventory): array{compatible: bool, checks: array<int, array{name: string, passed: bool, detail: string}>}`

- [ ] **Step 1: Write failing evaluator tests**

Create `ops/cpanel/tests/PreflightEvaluatorTest.php`:

```php
<?php

namespace Golvia\Cpanel\Tests;

require_once __DIR__.'/../src/PreflightEvaluator.php';

use Golvia\Cpanel\PreflightEvaluator;
use PHPUnit\Framework\TestCase;

class PreflightEvaluatorTest extends TestCase
{
    public function test_accepts_a_compatible_cpanel_inventory(): void
    {
        $result = PreflightEvaluator::evaluate([
            'php_version' => '8.3.15',
            'extensions' => ['curl', 'fileinfo', 'gd', 'intl', 'mbstring', 'openssl', 'pdo_mysql', 'zip'],
            'database_driver' => 'mariadb',
            'database_version' => '10.11.8',
            'commands' => ['composer' => true, 'php' => true],
            'paths' => ['storage_writable' => true, 'cache_writable' => true, 'public_root_isolated' => true],
            'cron_available' => true,
            'ssl_available' => true,
            'url_rewrite_available' => true,
        ]);

        $this->assertTrue($result['compatible']);
        $this->assertNotEmpty($result['checks']);
    }

    public function test_rejects_a_typical_incompatible_shared_host(): void
    {
        $result = PreflightEvaluator::evaluate([
            'php_version' => '8.1.29',
            'extensions' => ['curl', 'mbstring'],
            'database_driver' => 'mysql',
            'database_version' => '5.7.44',
            'commands' => ['composer' => false, 'php' => true],
            'paths' => ['storage_writable' => false, 'cache_writable' => false, 'public_root_isolated' => false],
            'cron_available' => false,
            'ssl_available' => true,
            'url_rewrite_available' => false,
        ]);

        $this->assertFalse($result['compatible']);
        $failedNames = array_column(
            array_filter($result['checks'], fn (array $check) => ! $check['passed']),
            'name'
        );
        $this->assertContains('PHP 8.2 or newer', $failedNames);
        $this->assertContains('Required PHP extensions', $failedNames);
        $this->assertContains('Composer 2', $failedNames);
        $this->assertContains('Isolated public document root', $failedNames);
        $this->assertContains('Cron Jobs', $failedNames);
    }
}
```

Create `ops/cpanel/phpunit.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<phpunit bootstrap="../../nexopos/vendor/autoload.php" colors="true">
  <testsuites>
    <testsuite name="cPanel preflight">
      <directory>tests</directory>
    </testsuite>
  </testsuites>
</phpunit>
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```powershell
& nexopos/vendor/bin/phpunit -c ops/cpanel/phpunit.xml
```

Expected: FAIL because `Golvia\Cpanel\PreflightEvaluator` does not exist.

- [ ] **Step 3: Implement the pure evaluator**

Create `ops/cpanel/src/PreflightEvaluator.php`:

```php
<?php

namespace Golvia\Cpanel;

final class PreflightEvaluator
{
    private const REQUIRED_EXTENSIONS = [
        'curl', 'fileinfo', 'gd', 'intl', 'mbstring', 'openssl', 'pdo_mysql', 'zip',
    ];

    public static function evaluate(array $inventory): array
    {
        $extensions = array_map('strtolower', $inventory['extensions']);
        $missing = array_values(array_diff(self::REQUIRED_EXTENSIONS, $extensions));
        $databaseSupported = match (strtolower($inventory['database_driver'])) {
            'mysql' => version_compare($inventory['database_version'], '8.4.0', '>='),
            'mariadb' => version_compare($inventory['database_version'], '10.11.0', '>='),
            default => false,
        };

        $checks = [
            self::check('PHP 8.2 or newer', version_compare($inventory['php_version'], '8.2.0', '>='), $inventory['php_version']),
            self::check('Required PHP extensions', $missing === [], $missing === [] ? 'all loaded' : 'missing: '.implode(', ', $missing)),
            self::check('Supported database', $databaseSupported, $inventory['database_driver'].' '.$inventory['database_version']),
            self::check('Composer 2', (bool) ($inventory['commands']['composer'] ?? false), 'required for locked dependency installation'),
            self::check('Writable Laravel storage', (bool) ($inventory['paths']['storage_writable'] ?? false), 'storage must be writable'),
            self::check('Writable Laravel cache', (bool) ($inventory['paths']['cache_writable'] ?? false), 'bootstrap/cache must be writable'),
            self::check('Isolated public document root', (bool) ($inventory['paths']['public_root_isolated'] ?? false), 'only nexopos/public may be web-accessible'),
            self::check('Cron Jobs', (bool) $inventory['cron_available'], 'Laravel scheduler must run'),
            self::check('HTTPS', (bool) $inventory['ssl_available'], 'production and staging require HTTPS'),
            self::check('Apache URL rewriting', (bool) $inventory['url_rewrite_available'], 'Laravel front controller requires rewriting'),
        ];

        return [
            'compatible' => ! in_array(false, array_column($checks, 'passed'), true),
            'checks' => $checks,
        ];
    }

    private static function check(string $name, bool $passed, string $detail): array
    {
        return compact('name', 'passed', 'detail');
    }
}
```

- [ ] **Step 4: Run the evaluator tests**

Run:

```powershell
& nexopos/vendor/bin/phpunit -c ops/cpanel/phpunit.xml
```

Expected: PASS with two tests and all assertions passing.

- [ ] **Step 5: Commit the evaluator**

```powershell
git add ops/cpanel/src/PreflightEvaluator.php ops/cpanel/tests/PreflightEvaluatorTest.php ops/cpanel/phpunit.xml
git commit -m "feat: add cPanel compatibility evaluator"
```

---

### Task 4: Add the Read-Only Host Inventory Command

**Files:**
- Create: `ops/cpanel/preflight.php`
- Create: `ops/cpanel/cpanel-preflight.json.example`
- Modify: `ops/cpanel/tests/PreflightEvaluatorTest.php`

**Interfaces:**
- Consumes: actual PHP runtime, extensions, PDO server version, environment variables `GOLVIA_PREFLIGHT_DB_HOST`, `GOLVIA_PREFLIGHT_DB_PORT`, `GOLVIA_PREFLIGHT_DB_NAME`, `GOLVIA_PREFLIGHT_DB_USER`, and an interactively supplied database password
- Produces: JSON to standard output with compatibility checks; never prints or saves the password

- [ ] **Step 1: Add a failing test for safe JSON output**

Append to `PreflightEvaluatorTest`:

```php
public function test_result_is_safe_json_without_credentials(): void
{
    $result = PreflightEvaluator::evaluate([
        'php_version' => '8.3.15',
        'extensions' => ['curl', 'fileinfo', 'gd', 'intl', 'mbstring', 'openssl', 'pdo_mysql', 'zip'],
        'database_driver' => 'mysql',
        'database_version' => '8.4.3',
        'commands' => ['composer' => true, 'php' => true],
        'paths' => ['storage_writable' => true, 'cache_writable' => true, 'public_root_isolated' => true],
        'cron_available' => true,
        'ssl_available' => true,
        'url_rewrite_available' => true,
    ]);

    $json = json_encode($result, JSON_THROW_ON_ERROR);
    $this->assertStringNotContainsString('password', strtolower($json));
    $this->assertStringNotContainsString('proper15_golviauser', $json);
}
```

- [ ] **Step 2: Run the test**

Run:

```powershell
& nexopos/vendor/bin/phpunit -c ops/cpanel/phpunit.xml
```

Expected: PASS; this test protects the evaluator result format before the host command is introduced.

- [ ] **Step 3: Create the host inventory command**

Create `ops/cpanel/preflight.php`:

```php
<?php

declare(strict_types=1);

require __DIR__.'/../../nexopos/vendor/autoload.php';

use Golvia\Cpanel\PreflightEvaluator;

$requiredEnvironment = [
    'GOLVIA_PREFLIGHT_DB_HOST',
    'GOLVIA_PREFLIGHT_DB_PORT',
    'GOLVIA_PREFLIGHT_DB_NAME',
    'GOLVIA_PREFLIGHT_DB_USER',
    'GOLVIA_PREFLIGHT_DOCUMENT_ROOT',
];

foreach ($requiredEnvironment as $name) {
    if (getenv($name) === false || getenv($name) === '') {
        fwrite(STDERR, "Missing environment variable: {$name}\n");
        exit(2);
    }
}

fwrite(STDERR, "Database password: ");
$password = trim((string) fgets(STDIN));
$dsn = sprintf(
    'mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4',
    getenv('GOLVIA_PREFLIGHT_DB_HOST'),
    getenv('GOLVIA_PREFLIGHT_DB_PORT'),
    getenv('GOLVIA_PREFLIGHT_DB_NAME')
);

$pdo = new PDO($dsn, getenv('GOLVIA_PREFLIGHT_DB_USER'), $password, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
]);
$serverVersion = (string) $pdo->getAttribute(PDO::ATTR_SERVER_VERSION);
$driver = stripos($serverVersion, 'mariadb') !== false ? 'mariadb' : 'mysql';
preg_match('/\d+\.\d+\.\d+/', $serverVersion, $matches);

$projectRoot = realpath(__DIR__.'/../../nexopos');
$publicRoot = realpath($projectRoot.'/public');
$documentRoot = realpath((string) getenv('GOLVIA_PREFLIGHT_DOCUMENT_ROOT'));
$composerVersion = trim((string) shell_exec('composer --version 2>&1'));

$inventory = [
    'php_version' => PHP_VERSION,
    'extensions' => get_loaded_extensions(),
    'database_driver' => $driver,
    'database_version' => $matches[0] ?? '0.0.0',
    'commands' => ['composer' => str_starts_with($composerVersion, 'Composer version 2.'), 'php' => true],
    'paths' => [
        'storage_writable' => is_writable($projectRoot.'/storage'),
        'cache_writable' => is_writable($projectRoot.'/bootstrap/cache'),
        'public_root_isolated' => $publicRoot !== false && $documentRoot === $publicRoot,
    ],
    'cron_available' => getenv('GOLVIA_PREFLIGHT_CRON_AVAILABLE') === '1',
    'ssl_available' => getenv('GOLVIA_PREFLIGHT_SSL_AVAILABLE') === '1',
    'url_rewrite_available' => getenv('GOLVIA_PREFLIGHT_REWRITE_AVAILABLE') === '1',
];

$result = PreflightEvaluator::evaluate($inventory);
$result['inventory'] = [
    'php_version' => $inventory['php_version'],
    'extensions' => $inventory['extensions'],
    'database_driver' => $inventory['database_driver'],
    'database_version' => $inventory['database_version'],
];

echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR).PHP_EOL;
exit($result['compatible'] ? 0 : 1);
```

- [ ] **Step 4: Create a credential-free example result**

Create `ops/cpanel/cpanel-preflight.json.example`:

```json
{
  "compatible": true,
  "checks": [
    {"name": "PHP 8.2 or newer", "passed": true, "detail": "8.3.15"},
    {"name": "Required PHP extensions", "passed": true, "detail": "all loaded"},
    {"name": "Supported database", "passed": true, "detail": "mariadb 10.11.8"},
    {"name": "Composer 2", "passed": true, "detail": "required for locked dependency installation"},
    {"name": "Writable Laravel storage", "passed": true, "detail": "storage must be writable"},
    {"name": "Writable Laravel cache", "passed": true, "detail": "bootstrap/cache must be writable"},
    {"name": "Isolated public document root", "passed": true, "detail": "only nexopos/public may be web-accessible"},
    {"name": "Cron Jobs", "passed": true, "detail": "Laravel scheduler must run"},
    {"name": "HTTPS", "passed": true, "detail": "production and staging require HTTPS"},
    {"name": "Apache URL rewriting", "passed": true, "detail": "Laravel front controller requires rewriting"}
  ],
  "inventory": {
    "php_version": "8.3.15",
    "extensions": ["curl", "fileinfo", "gd", "intl", "mbstring", "openssl", "pdo_mysql", "zip"],
    "database_driver": "mariadb",
    "database_version": "10.11.8"
  }
}
```

- [ ] **Step 5: Run all preflight tests and inspect secret patterns**

Run:

```powershell
& nexopos/vendor/bin/phpunit -c ops/cpanel/phpunit.xml
rg -n -i "DB_PASSWORD=.+|cpanel.*password|proper15_golviauser.*password" ops/cpanel
```

Expected: tests PASS and `rg` returns no matches.

- [ ] **Step 6: Commit the host inventory command**

```powershell
git add ops/cpanel/preflight.php ops/cpanel/cpanel-preflight.json.example ops/cpanel/tests/PreflightEvaluatorTest.php
git commit -m "feat: inventory cPanel hosting requirements"
```

---

### Task 5: Document the Secure cPanel Deployment Contract

**Files:**
- Create: `ops/cpanel/DEPLOYMENT.md`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: cPanel account home `/home/proper15`, subdomain `pos.golvia.my`, staging database `proper15_golvia`, staging user `proper15_golviauser`
- Produces: operator procedure that installs NexoPOS without publishing secrets or exposing the Laravel root

- [ ] **Step 1: Add failing ignore checks for deployment secrets**

Run:

```powershell
git check-ignore -q -- nexopos/.env
git check-ignore -q -- ops/cpanel/cpanel-preflight.json
git check-ignore -q -- backups/proper15_golvia.sql
```

Expected: at least one command returns non-zero before the ignore rules are added.

- [ ] **Step 2: Add explicit secret and backup ignore rules**

Append to `.gitignore`:

```gitignore
# NexoPOS runtime secrets and generated state
nexopos/.env
nexopos/.env.*
!nexopos/.env.example
nexopos/storage/logs/*.log

# cPanel verification output and database backups
ops/cpanel/cpanel-preflight.json
backups/
*.sql
*.sql.gz
```

- [ ] **Step 3: Verify the ignore rules**

Run:

```powershell
git check-ignore -v -- nexopos/.env ops/cpanel/cpanel-preflight.json backups/proper15_golvia.sql
```

Expected: each path is ignored by the new rules.

- [ ] **Step 4: Write the deployment procedure**

Create `ops/cpanel/DEPLOYMENT.md` with these executable sections:

```markdown
# GOLVIA NexoPOS cPanel Deployment

## Staging identity

- URL: https://pos.golvia.my
- Account home: /home/proper15
- Application source: /home/proper15/nexopos
- Required document root: /home/proper15/nexopos/public
- Staging database: proper15_golvia
- Staging database user: proper15_golviauser
- Time zone: Asia/Kuala_Lumpur
- Currency: MYR

The database password and APP_KEY are entered directly into /home/proper15/nexopos/.env. They are never copied into this repository, screenshots, shell history, or verification reports.

## Hosting gate

1. Confirm Terminal or SSH, Composer 2, PHP 8.2 or newer, Cron Jobs, AutoSSL, and the required PHP extensions.
2. Confirm MySQL 8.4 or newer or MariaDB 10.11 or newer.
3. Change the subdomain document root to /home/proper15/nexopos/public. Stop if cPanel restricts it; request the hosting provider to set it. Do not upload the entire Laravel project under a public document root as a workaround.
4. Enable cPanel Directory Privacy for staging before the first application response is exposed.

## Install staging

1. Upload or check out the approved nexopos directory to /home/proper15/nexopos.
2. Select the approved PHP version for pos.golvia.my and for CLI commands.
3. Run composer install --no-dev --prefer-dist --optimize-autoloader.
4. Copy .env.example to .env and run php artisan key:generate.
5. Set APP_ENV=staging, APP_DEBUG=false, APP_URL=https://pos.golvia.my, APP_TIMEZONE=Asia/Kuala_Lumpur, DB_CONNECTION=mysql, DB_HOST=localhost, DB_PORT=3306, DB_DATABASE=proper15_golvia, and DB_USERNAME=proper15_golviauser.
6. Enter the database password privately in DB_PASSWORD.
7. Run php artisan storage:link, php artisan optimize:clear, and php artisan optimize.
8. Complete the NexoPOS setup wizard using a unique administrator password.

## Scheduler

Create a cPanel Cron Job that runs once per minute with the cPanel PHP binary selected during preflight:

php /home/proper15/nexopos/artisan schedule:run >> /home/proper15/nexopos/storage/logs/scheduler.log 2>&1

If Supervisor is unavailable, keep queue work synchronous for the baseline. Before enabling any feature that requires asynchronous queues or Reverb, create and test a bounded cPanel-compatible worker strategy or move to a compatible host.

## SSL and public access

1. Wait for AutoSSL to issue a valid certificate for pos.golvia.my.
2. Enable Force HTTPS Redirect only after HTTPS loads without a certificate error.
3. Keep Directory Privacy enabled throughout staging.
4. Verify APP_DEBUG=false and confirm that error pages contain no stack trace.

## Backup and rollback

1. Export proper15_golvia before every schema migration.
2. Back up /home/proper15/nexopos/storage/app and uploaded media.
3. Store one encrypted copy outside the cPanel account.
4. Roll application files back to the preceding approved release if a code-only deployment fails.
5. Restore the database only when the release-specific migration procedure says the schema cannot roll back safely.
```

- [ ] **Step 5: Verify deployment documentation and secret safety**

Run:

```powershell
rg -n "nexopos/public|APP_DEBUG=false|schedule:run|Directory Privacy|AutoSSL|proper15_golvia" ops/cpanel/DEPLOYMENT.md
rg -n -i "DB_PASSWORD=.+|APP_KEY=.+|cpanel.*password" ops/cpanel/DEPLOYMENT.md
git diff --check -- .gitignore ops/cpanel/DEPLOYMENT.md
```

Expected: the first command finds all deployment gates; the second finds nothing; diff check passes.

- [ ] **Step 6: Commit the deployment contract**

```powershell
git add .gitignore ops/cpanel/DEPLOYMENT.md
git commit -m "docs: define secure cPanel deployment"
```

---

### Task 6: Execute the Actual cPanel Preflight

**Files:**
- Create locally after sanitization: `ops/cpanel/cpanel-preflight.json` (ignored)
- Create on server: `/home/proper15/nexopos/` staging application directory
- Modify in cPanel: `pos.golvia.my` document root

**Interfaces:**
- Consumes: cPanel Terminal/SSH session, database password entered interactively, existing empty database and user
- Produces: sanitized compatibility JSON and an explicit go/no-go hosting decision

- [ ] **Step 1: Confirm required cPanel interfaces without changing the domain**

In cPanel search, verify the account exposes:

```text
Terminal or SSH Access
MultiPHP Manager
Select PHP Version or PHP Extensions
Cron Jobs
SSL/TLS Status
Directory Privacy
File Manager
phpMyAdmin
Backup or Backup Wizard
```

Expected: Terminal/SSH, Cron Jobs, SSL, PHP selection/extensions, File Manager, phpMyAdmin, and backup access are present. If Terminal/SSH or Cron Jobs is absent, record `NO-GO` and contact the hosting provider before continuing.

- [ ] **Step 2: Run non-destructive version and extension checks in cPanel Terminal**

Run:

```bash
php -v
composer --version
php -m
php -r "echo PHP_BINARY, PHP_EOL;"
```

Expected: PHP is at least 8.2, Composer is major version 2, and modules include `curl`, `fileinfo`, `gd`, `intl`, `mbstring`, `openssl`, `pdo_mysql`, and `zip`.

- [ ] **Step 3: Upload the source to the non-public application directory**

Upload the approved `nexopos/` tree and `ops/cpanel/` scripts so the server paths are:

```text
/home/proper15/nexopos
/home/proper15/ops/cpanel
```

Expected: `/home/proper15/nexopos/artisan` exists and no application source has been copied into `/home/proper15/public_html/pos.golvia.my`.

- [ ] **Step 4: Install locked production dependencies**

Run:

```bash
cd /home/proper15/nexopos
composer install --no-dev --prefer-dist --optimize-autoloader
php artisan --version
```

Expected: Composer completes without ignoring platform requirements; Artisan reports Laravel 12.x.

- [ ] **Step 5: Set the isolated document root and permissions**

In cPanel Domains, change `pos.golvia.my` document root to:

```text
/home/proper15/nexopos/public
```

Set `storage/` and `bootstrap/cache/` writable for the cPanel application user without granting world-write permissions. Enable Directory Privacy before loading the site.

Expected: cPanel reports the new document root, HTTPS requests cannot download `.env` or `composer.json`, and the staging URL requires Directory Privacy authentication.

- [ ] **Step 6: Run the preflight against the empty staging database**

Export the non-secret variables in the cPanel Terminal session, then enter the database password only when prompted:

```bash
export GOLVIA_PREFLIGHT_DB_HOST=localhost
export GOLVIA_PREFLIGHT_DB_PORT=3306
export GOLVIA_PREFLIGHT_DB_NAME=proper15_golvia
export GOLVIA_PREFLIGHT_DB_USER=proper15_golviauser
export GOLVIA_PREFLIGHT_DOCUMENT_ROOT=/home/proper15/nexopos/public
export GOLVIA_PREFLIGHT_CRON_AVAILABLE=1
export GOLVIA_PREFLIGHT_SSL_AVAILABLE=1
export GOLVIA_PREFLIGHT_REWRITE_AVAILABLE=1
php /home/proper15/ops/cpanel/preflight.php
```

Expected: JSON reports `compatible: true`, database connectivity succeeds, and output contains no password.

- [ ] **Step 7: Sanitize and save the evidence locally**

Copy only the JSON output to ignored `ops/cpanel/cpanel-preflight.json`. Search it before retaining it:

```powershell
rg -n -i "password|secret|session|cookie|proper15_golviauser" ops/cpanel/cpanel-preflight.json
```

Expected: no matches.

- [ ] **Step 8: Record the gate result**

If every required check passes, record `GO` in the verification report. If one fails, record `NO-GO`, the exact failed check, and the provider action required. Do not bypass Composer platform checks, expose the project root, or replace HTTPS with HTTP.

No commit is made for the ignored raw JSON.

---

### Task 7: Install and Configure the Access-Controlled Staging Baseline

**Files:**
- Create on server: `/home/proper15/nexopos/.env` (never committed)
- Create on server: `/home/proper15/nexopos/public/storage` link
- Modify in cPanel: Cron Job and AutoSSL/HTTPS settings

**Interfaces:**
- Consumes: passing Task 6 preflight, `proper15_golvia`, `proper15_golviauser`, privately entered database password
- Produces: password-protected NexoPOS 6.2.2 staging instance at `https://pos.golvia.my`

- [ ] **Step 1: Back up the empty staging database before setup migrations**

Use cPanel Backup/phpMyAdmin to export `proper15_golvia` and confirm the export file is non-empty. Keep it outside Git.

Expected: a restorable pre-install database export exists.

- [ ] **Step 2: Create the staging environment file privately**

Copy `.env.example` to `.env`, generate the Laravel key, then set these non-secret values:

```dotenv
APP_ENV=staging
APP_DEBUG=false
APP_URL=https://pos.golvia.my
APP_TIMEZONE=Asia/Kuala_Lumpur
DB_CONNECTION=mysql
DB_HOST=localhost
DB_PORT=3306
DB_DATABASE=proper15_golvia
DB_USERNAME=proper15_golviauser
```

Enter `DB_PASSWORD` directly through the cPanel editor or a non-logged interactive method. Do not paste it into chat or the implementation report.

- [ ] **Step 3: Generate links and clear stale configuration**

Run:

```bash
cd /home/proper15/nexopos
php artisan key:generate
php artisan storage:link
php artisan optimize:clear
php artisan config:show app
php artisan config:show database
```

Expected: application URL, environment, timezone, and database connection name are correct; command output does not reveal the database password.

- [ ] **Step 4: Complete the NexoPOS setup wizard**

Open `https://pos.golvia.my` behind Directory Privacy, complete the official setup wizard, select MYR and `Asia/Kuala_Lumpur`, and create a unique administrator credential.

Expected: login succeeds and no PHP warning, stack trace, directory listing, or mixed-content warning is visible.

- [ ] **Step 5: Configure the scheduler**

Create the cPanel Cron Job using the PHP binary confirmed by preflight:

```bash
php /home/proper15/nexopos/artisan schedule:run >> /home/proper15/nexopos/storage/logs/scheduler.log 2>&1
```

Schedule: once per minute.

Expected after two minutes: the scheduler log exists, is writable, and contains no command-not-found, permission, or PHP-version error.

- [ ] **Step 6: Optimize staging and verify debug safety**

Run:

```bash
cd /home/proper15/nexopos
php artisan optimize
php artisan about
```

Expected: environment is `staging`, debug mode is off, and cache/config paths are writable.

- [ ] **Step 7: Verify protected HTTPS access**

Run from a machine outside cPanel:

```powershell
curl.exe -I http://pos.golvia.my
curl.exe -I https://pos.golvia.my
curl.exe -I https://pos.golvia.my/.env
curl.exe -I https://pos.golvia.my/composer.json
```

Expected: HTTP redirects to HTTPS; unauthenticated HTTPS is blocked by Directory Privacy; `.env` and `composer.json` are never returned with `200 OK`.

No server `.env`, database dump, password, or generated key is committed.

---

### Task 8: Verify the Stock NexoPOS Workflows and Record the Baseline Decision

**Files:**
- Create: `docs/verification/nexopos-baseline.md`

**Interfaces:**
- Consumes: protected staging instance, NexoPOS administrator account, standard barcode scanner, actual receipt printer if supported at this phase
- Produces: signed-off baseline evidence and the exact extension points to be used by the membership plan

- [ ] **Step 1: Create disposable baseline records through the UI**

Create:

```text
Category: Baseline Test
Customer: Baseline Member, phone +601100000001
Product: Baseline Ring
Variant/SKU: BASE-RING-001
Barcode: 9550000000001
Cost: RM50.00
Selling price: RM100.00
Opening quantity: 5
Payment methods: Cash and DuitNow QR
Tax: a clearly labeled non-production baseline tax configuration
```

Expected: the product is searchable by name, SKU, and barcode, and stock shows 5.

- [ ] **Step 2: Execute a standard sale**

Scan `9550000000001`, attach the baseline customer, accept RM100 by Cash, and complete the order.

Expected: one order and payment exist, stock becomes 4, the receipt is viewable/reprintable, and the order records the customer and operator.

- [ ] **Step 3: Execute a standard full refund**

Refund the baseline order through the standard NexoPOS flow.

Expected: a linked refund exists, stock returns to 5, the original sale remains in history, and reporting does not count the refunded amount as net sales.

- [ ] **Step 4: Exercise register, role, tax, receipt, and quotation discovery**

Record whether stock NexoPOS supports each capability directly, through an official module, through a documented extension event/filter, or not at all:

```text
register open and close
cash reconciliation
administrator discount permission
void or cancel permission
tax-inclusive and tax-exclusive pricing
receipt template extension
customer fields extension
quotation creation and conversion
order submitted event
order refunded event
POS cart component extension
scheduled command registration
```

Expected: every row has one evidence-backed classification and a source file, class, event name, documentation link, or marketplace module reference.

- [ ] **Step 5: Run the automated baseline suite**

Run locally from `nexopos/`:

```powershell
php artisan test
Set-Location ..
& nexopos/vendor/bin/phpunit -c ops/cpanel/phpunit.xml
git diff --check
```

Expected: upstream tests and cPanel evaluator tests pass; no whitespace errors.

- [ ] **Step 6: Write the verification report**

Use `apply_patch` to create `docs/verification/nexopos-baseline.md` after Steps 1-5 have produced the evidence. Begin with `# NexoPOS Baseline Verification`, then include these sections in order:

1. `Decision`: write `GO` only if every required host check and critical cashier workflow passed; otherwise write `NO-GO` and name every blocking check.
2. `Version and source`: write tag `v6.2.2`, commit `6061a93cf2d3fa0e0fb2896873315485fccc4ba1`, the observed PHP and database versions, staging URL, and staging database name.
3. `Hosting checks`: make a table with one observed PASS/FAIL row for PHP, extensions, database, Composer, storage, cache, document-root isolation, cron, HTTPS, URL rewriting, backups, and Directory Privacy.
4. `Automated tests`: write each command executed in Step 5, its observed test count, result, and execution date.
5. `Cashier workflow checks`: make a table with observed results and evidence for product creation, SKU/barcode lookup, sale, payment, stock deduction, receipt, full refund, stock restoration, register close, and reporting.
6. `Extension point inventory`: for roles, tax, receipt, customer fields, quotation, order submission, refund, cart UI, and scheduled commands, record `core`, `official module`, `documented extension`, or `missing`, followed by the exact source path, event/class name, documentation URL, or module URL.
7. `Risks and follow-up`: include only observed risks, each with an owner, required action, and the later plan that resolves it.
8. `Approval`: record owner approval only after every critical item passes, and name the next plan as membership configuration, accounts, tiers, and immutable coin ledger.

Do not write sample values, unverified PASS results, secrets, or instructions-to-self into the completed report.

- [ ] **Step 7: Remove disposable records or reset staging**

Use supported NexoPOS UI operations or restore the pre-install staging backup. Do not run ad hoc destructive SQL against the staging schema.

Expected: staging is ready for the membership plan with no unexplained baseline sales or stock differences.

- [ ] **Step 8: Commit the verified baseline report**

```powershell
git add docs/verification/nexopos-baseline.md
git commit -m "docs: verify NexoPOS cPanel baseline"
```

## Plan Self-Review Record

- Spec coverage for this subproject: upstream pinning, license preservation, hosting preflight, public-root isolation, PHP/database/cron requirements, HTTPS, secret handling, baseline POS workflows, backup, rollback, and an explicit go/no-go gate are covered.
- Intentionally deferred: membership, coins, vouchers, birthday rewards, checkout reward composition, reward refunds, CRM messaging, production SST rules, MyInvois adapter, product import, branding, and production cutover each belong to later independently testable plans.
- Interface consistency: `PreflightEvaluator::evaluate(array): array` is introduced in Task 3 and consumed unchanged by Tasks 4 and 6.
- Source-layout consistency: NexoPOS remains under `nexopos/`; cPanel-only tooling remains under `ops/cpanel/`; server secrets and evidence JSON are ignored.
