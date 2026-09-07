<?php

namespace Tests\Feature\Golvia;

use App\Models\Permission;
use App\Models\Role;
use App\Services\ModulesService;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use LogicException;
use Modules\GolviaMembership\GolviaMembershipModule;
use Modules\GolviaMembership\Models\CoinTransaction;
use Modules\GolviaMembership\Models\MembershipAccount;
use Modules\GolviaMembership\Models\MembershipRuleVersion;
use Modules\GolviaMembership\Models\MembershipTier;
use Modules\GolviaMembership\Models\SettingsAudit;
use Modules\GolviaMembership\Providers\GolviaMembershipServiceProvider;
use Tests\TestCase;

class MembershipModuleSchemaTest extends TestCase
{
    private const MIGRATION = 'modules/GolviaMembership/Migrations/2026_09_07_000001_create_membership_foundation.php';

    private array $tables = [
        'golvia_membership_settings_audits',
        'golvia_coin_transactions',
        'golvia_membership_accounts',
        'golvia_membership_tiers',
        'golvia_membership_rule_versions',
    ];

    protected function setUp(): void
    {
        parent::setUp();

        $this->loadModuleClasses();

        foreach ($this->tables as $table) {
            Schema::dropIfExists($table);
        }

        $this->ensureAuthorizationTablesExist();
        DB::table('nexopos_role_permission')->delete();
        Permission::query()->where('namespace', 'like', 'golvia.membership.%')->delete();
        Permission::query()->where('namespace', 'example.unrelated')->delete();
        Permission::query()->where('namespace', 'example.cashier.permission')->delete();
        Role::query()->whereIn('namespace', [Role::ADMIN, Role::STOREADMIN, Role::STORECASHIER])->delete();

        foreach ([
            Role::ADMIN => 'Administrator',
            Role::STOREADMIN => 'Store Administrator',
            Role::STORECASHIER => 'Store Cashier',
        ] as $namespace => $name) {
            Role::query()->create([
                'namespace' => $namespace,
                'name' => $name,
                'description' => $name,
            ]);
        }
    }

    protected function tearDown(): void
    {
        foreach ($this->tables as $table) {
            Schema::dropIfExists($table);
        }

        parent::tearDown();
    }

    public function test_modules_service_discovers_entry_provider_and_migration_metadata(): void
    {
        $service = new ModulesService;
        $service->load('GolviaMembership');
        $module = $service->get('GolviaMembership');

        $this->assertIsArray($module);
        $this->assertSame('GolviaMembership', $module['namespace']);
        $this->assertSame('1.0.0', $module['version']);
        $this->assertSame('GOLVIA Membership', $module['name']);
        $this->assertSame('6.2.2', $module['core']['min-version']);
        $this->assertSame(GolviaMembershipModule::class, $module['entry-class']);
        $this->assertContains('GolviaMembership/Providers/GolviaMembershipServiceProvider.php', $module['providers']);
        $this->assertContains(
            'GolviaMembership/Migrations/2026_09_07_000001_create_membership_foundation.php',
            $service->getAllModuleMigrationFiles($module)
        );
        $this->assertInstanceOf(GolviaMembershipModule::class, new GolviaMembershipModule);
        $this->assertInstanceOf(GolviaMembershipServiceProvider::class, new GolviaMembershipServiceProvider($this->app));
    }

    public function test_migration_creates_foundation_defaults_permissions_and_role_assignments(): void
    {
        $this->migrateUp();

        foreach ($this->tables as $table) {
            $this->assertTrue(Schema::hasTable($table), "Missing table: {$table}");
        }

        $rule = MembershipRuleVersion::query()->sole();
        $this->assertSame('3.00', $rule->earning_spend_amount);
        $this->assertSame(1, $rule->coins_earned);
        $this->assertSame(100, $rule->redemption_coins);
        $this->assertSame('1.00', $rule->redemption_value);
        $this->assertSame(MembershipRuleVersion::STATE_ACTIVE, $rule->activation_state);
        $this->assertSame(MembershipRuleVersion::RECALCULATION_COMPLETED, $rule->recalculation_state);

        $this->assertSame([
            ['white', 0, 3000, '0.00'],
            ['silver', 3001, 5000, '0.00'],
            ['gold', 5001, 12000, '0.00'],
            ['platinum', 12001, null, '0.00'],
        ], MembershipTier::query()->orderBy('display_order')->get()->map(fn (MembershipTier $tier) => [
            $tier->key,
            $tier->minimum_lifetime_coins,
            $tier->maximum_lifetime_coins,
            $tier->discount_percent,
        ])->all());

        $permissions = [
            'golvia.membership.pos-summary',
            'golvia.membership.read',
            'golvia.membership.manage',
            'golvia.membership.adjust-coins',
            'golvia.membership.manage-tiers',
            'golvia.membership.manage-settings',
        ];
        $this->assertSame($permissions, Permission::query()->whereIn('namespace', $permissions)->orderBy('id')->pluck('namespace')->all());

        $this->assertRoleHasPermissions(Role::ADMIN, $permissions);
        $this->assertRoleHasPermissions(Role::STOREADMIN, $permissions);
        $this->assertRoleHasPermissions(Role::STORECASHIER, ['golvia.membership.pos-summary']);
    }

    public function test_schema_enforces_identity_and_ledger_idempotency_constraints(): void
    {
        $this->migrateUp();
        $tier = MembershipTier::query()->where('key', 'white')->firstOrFail();

        $first = MembershipAccount::query()->create($this->accountAttributes(101, 'GOL-000101', $tier->id));

        $this->expectDatabaseConstraint(fn () => MembershipAccount::query()->create(
            $this->accountAttributes(101, 'GOL-000102', $tier->id)
        ));
        $this->expectDatabaseConstraint(fn () => MembershipAccount::query()->create(
            $this->accountAttributes(102, 'GOL-000101', $tier->id)
        ));

        $transaction = $this->transactionAttributes($first->id, 101, 'earn', 'order', '5001', 'earn:order:5001');
        CoinTransaction::query()->create($transaction);

        $this->expectDatabaseConstraint(fn () => CoinTransaction::query()->create([
            ...$transaction,
            'source_id' => '5002',
        ]));
        $this->expectDatabaseConstraint(fn () => CoinTransaction::query()->create([
            ...$transaction,
            'idempotency_key' => 'earn:order:5001:retry',
        ]));

        $this->assertSame(64, strlen(CoinTransaction::query()->sole()->payload_fingerprint));
        $this->assertNotNull(CoinTransaction::query()->sole()->rule_version_id);
        $this->assertNotEmpty(CoinTransaction::query()->sole()->rule_version_snapshot);
    }

    public function test_schema_uses_bigints_and_does_not_cascade_from_core_customers(): void
    {
        $this->migrateUp();

        $accountColumns = $this->sqliteColumns('golvia_membership_accounts');
        $transactionColumns = $this->sqliteColumns('golvia_coin_transactions');

        // SQLite intentionally maps Laravel BIGINT columns to INTEGER affinity.
        $this->assertSame('integer', strtolower($accountColumns['available_coin_balance']['type']));
        $this->assertSame('integer', strtolower($accountColumns['lifetime_earned_coins']['type']));
        $this->assertSame('integer', strtolower($transactionColumns['balance_delta']['type']));
        $this->assertSame('integer', strtolower($transactionColumns['lifetime_delta']['type']));

        $migrationSource = file_get_contents(base_path(self::MIGRATION));
        $this->assertSame(6, substr_count($migrationSource, '$table->bigInteger('));

        $accountForeignKeys = DB::select("PRAGMA foreign_key_list('" . DB::getTablePrefix() . "golvia_membership_accounts')");
        $this->assertFalse(collect($accountForeignKeys)->contains(fn ($key) => $key->from === 'customer_id'));
    }

    public function test_database_rejects_invalid_states_actions_and_missing_rule_snapshots(): void
    {
        $this->migrateUp();
        $tier = MembershipTier::query()->where('key', 'white')->firstOrFail();

        $this->expectDatabaseConstraint(fn () => DB::table('golvia_membership_accounts')->insert([
            ...$this->accountAttributes(150, 'GOL-000150', $tier->id, 'unknown'),
            'created_at' => now(),
            'updated_at' => now(),
        ]));

        foreach ([
            ['unknown', MembershipRuleVersion::RECALCULATION_COMPLETED],
            [MembershipRuleVersion::STATE_ACTIVE, 'unknown'],
        ] as [$activationState, $recalculationState]) {
            $this->expectDatabaseConstraint(fn () => DB::table('golvia_membership_rule_versions')->insert([
                'enabled' => true,
                'earning_spend_amount' => '3.00',
                'coins_earned' => 1,
                'redemption_coins' => 100,
                'redemption_value' => '1.00',
                'activation_state' => $activationState,
                'recalculation_state' => $recalculationState,
                'effective_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ]));
        }

        $account = MembershipAccount::query()->create($this->accountAttributes(151, 'GOL-000151', $tier->id));
        $invalidAction = $this->transactionAttributes($account->id, 151, 'earn', 'order', 'invalid-action', 'invalid-action');
        $invalidAction['action'] = 'unknown';
        $invalidAction['rule_version_snapshot'] = json_encode($invalidAction['rule_version_snapshot'], JSON_THROW_ON_ERROR);
        $invalidAction['metadata'] = json_encode($invalidAction['metadata'], JSON_THROW_ON_ERROR);
        $this->expectDatabaseConstraint(fn () => DB::table('golvia_coin_transactions')->insert([
            ...$invalidAction,
            'created_at' => now(),
            'updated_at' => now(),
        ]));

        $missingRule = $this->transactionAttributes($account->id, 151, 'earn', 'order', 'missing-rule', 'missing-rule');
        $missingRule['rule_version_id'] = null;
        $missingRule['rule_version_snapshot'] = null;
        $missingRule['metadata'] = json_encode($missingRule['metadata'], JSON_THROW_ON_ERROR);
        $this->expectDatabaseConstraint(fn () => DB::table('golvia_coin_transactions')->insert([
            ...$missingRule,
            'created_at' => now(),
            'updated_at' => now(),
        ]));
    }

    public function test_models_reject_unknown_statuses_actions_and_mutating_append_only_records(): void
    {
        $this->migrateUp();
        $tier = MembershipTier::query()->where('key', 'white')->firstOrFail();

        $this->expectException(LogicException::class);
        MembershipAccount::query()->create($this->accountAttributes(201, 'GOL-000201', $tier->id, 'unknown'));
    }

    public function test_coin_transactions_are_append_only_and_validate_actions(): void
    {
        $this->migrateUp();
        $tier = MembershipTier::query()->where('key', 'white')->firstOrFail();
        $account = MembershipAccount::query()->create($this->accountAttributes(301, 'GOL-000301', $tier->id));

        try {
            CoinTransaction::query()->create(
                $this->transactionAttributes($account->id, 301, 'unknown', 'manual', 'op-1', 'manual:op-1')
            );
            $this->fail('Unknown actions must be rejected.');
        } catch (LogicException) {
            $this->assertTrue(true);
        }

        $transaction = CoinTransaction::query()->create(
            $this->transactionAttributes($account->id, 301, 'earn', 'order', '7001', 'earn:order:7001')
        );

        $this->expectException(LogicException::class);
        $transaction->update(['reason' => 'rewritten']);
    }

    public function test_rule_tier_transaction_and_settings_audit_records_cannot_be_deleted(): void
    {
        $this->migrateUp();
        $rule = MembershipRuleVersion::query()->sole();
        $tier = MembershipTier::query()->where('key', 'white')->firstOrFail();
        $account = MembershipAccount::query()->create($this->accountAttributes(401, 'GOL-000401', $tier->id));
        $transaction = CoinTransaction::query()->create(
            $this->transactionAttributes($account->id, 401, 'earn', 'order', '8001', 'earn:order:8001')
        );
        $audit = SettingsAudit::query()->create([
            'rule_version_id' => $rule->id,
            'old_values' => ['enabled' => false],
            'new_values' => ['enabled' => true],
            'actor_id' => 1,
            'effective_at' => now(),
        ]);

        foreach ([$rule, $tier, $transaction, $audit] as $record) {
            try {
                $record->delete();
                $this->fail($record::class . ' must reject deletion.');
            } catch (LogicException) {
                $this->assertTrue(true);
            }
        }
    }

    public function test_retained_models_reject_bulk_eloquent_updates_and_deletes(): void
    {
        $this->migrateUp();
        $tier = MembershipTier::query()->where('key', 'white')->firstOrFail();
        $account = MembershipAccount::query()->create($this->accountAttributes(450, 'GOL-000450', $tier->id));
        CoinTransaction::query()->create(
            $this->transactionAttributes($account->id, 450, 'earn', 'order', 'bulk-guard', 'bulk-guard')
        );

        foreach ([
            fn () => CoinTransaction::query()->update(['reason' => 'tampered']),
            fn () => CoinTransaction::query()->delete(),
            fn () => SettingsAudit::query()->delete(),
            fn () => MembershipRuleVersion::query()->update(['earning_spend_amount' => '4.00']),
            fn () => MembershipRuleVersion::query()->delete(),
            fn () => MembershipTier::query()->delete(),
        ] as $mutation) {
            try {
                $mutation();
                $this->fail('Bulk Eloquent mutation must be rejected.');
            } catch (LogicException) {
                $this->assertTrue(true);
            }
        }
    }

    public function test_cashier_keeps_only_pos_summary_among_golvia_permissions(): void
    {
        $unrelated = Permission::query()->create([
            'namespace' => 'example.cashier.permission',
            'name' => 'Unrelated cashier permission',
            'description' => 'Must survive GOLVIA permission cleanup.',
        ]);
        $stale = Permission::query()->create([
            'namespace' => 'golvia.membership.legacy-admin',
            'name' => 'Legacy GOLVIA admin permission',
            'description' => 'Must be removed from cashier.',
        ]);
        $cashier = Role::namespace(Role::STORECASHIER);
        $cashier->addPermissions([$unrelated, $stale]);

        $this->migrateUp();

        $actual = DB::table('nexopos_role_permission')
            ->join('nexopos_permissions', 'nexopos_permissions.id', '=', 'nexopos_role_permission.permission_id')
            ->where('nexopos_role_permission.role_id', $cashier->id)
            ->pluck('nexopos_permissions.namespace')
            ->all();

        $this->assertContains('example.cashier.permission', $actual);
        $this->assertContains('golvia.membership.pos-summary', $actual);
        $this->assertSame(
            ['golvia.membership.pos-summary'],
            array_values(array_filter($actual, fn (string $permission) => str_starts_with($permission, 'golvia.membership.')))
        );
    }

    public function test_migration_is_idempotent_and_down_removes_only_module_owned_records(): void
    {
        Permission::query()->create([
            'namespace' => 'example.unrelated',
            'name' => 'Unrelated',
            'description' => 'Must survive module rollback.',
        ]);

        $migration = $this->migration();
        $migration->up();
        $migration->up();
        $migration->down();

        foreach ($this->tables as $table) {
            $this->assertFalse(Schema::hasTable($table));
        }
        $this->assertDatabaseHas('nexopos_permissions', ['namespace' => 'example.unrelated']);
        $this->assertDatabaseMissing('nexopos_permissions', ['namespace' => 'golvia.membership.read']);
    }

    public function test_rollback_preserves_preexisting_permission_namespace_collisions_across_repeated_cycles(): void
    {
        Permission::query()->create([
            'namespace' => 'golvia.membership.read',
            'name' => 'Externally owned membership reader',
            'description' => 'Created outside the GOLVIA module.',
        ]);

        for ($cycle = 0; $cycle < 2; $cycle++) {
            $migration = $this->migration();
            $migration->up();
            $migration->down();

            $this->assertDatabaseHas('nexopos_permissions', [
                'namespace' => 'golvia.membership.read',
                'name' => 'Externally owned membership reader',
                'description' => 'Created outside the GOLVIA module.',
            ]);
        }
    }

    private function migrateUp(): void
    {
        $this->migration()->up();
    }

    private function loadModuleClasses(): void
    {
        foreach ([
            'GolviaMembershipModule.php',
            'Models/RetainedRecordBuilder.php',
            'Models/AppendOnlyBuilder.php',
            'Models/RuleVersionBuilder.php',
            'Models/MembershipAccount.php',
            'Models/MembershipTier.php',
            'Models/CoinTransaction.php',
            'Models/MembershipRuleVersion.php',
            'Models/SettingsAudit.php',
            'Providers/GolviaMembershipServiceProvider.php',
        ] as $file) {
            require_once base_path('modules/GolviaMembership/' . $file);
        }
    }

    private function migration(): object
    {
        return require base_path(self::MIGRATION);
    }

    private function ensureAuthorizationTablesExist(): void
    {
        if (! Schema::hasTable('nexopos_roles')) {
            Schema::create('nexopos_roles', function (Blueprint $table): void {
                $table->increments('id');
                $table->string('name')->unique();
                $table->string('namespace')->unique();
                $table->text('description')->nullable();
                $table->integer('reward_system_id')->nullable();
                $table->float('minimal_credit_payment')->default(0);
                $table->integer('author_id')->nullable();
                $table->boolean('locked')->default(true);
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('nexopos_role_permission')) {
            Schema::create('nexopos_role_permission', function (Blueprint $table): void {
                $table->integer('permission_id');
                $table->integer('role_id');
                $table->primary(['permission_id', 'role_id']);
            });
        }

        if (! Schema::hasTable('nexopos_permissions')) {
            Schema::create('nexopos_permissions', function (Blueprint $table): void {
                $table->increments('id');
                $table->string('name')->unique();
                $table->string('namespace')->unique();
                $table->text('description');
                $table->timestamps();
            });
        }
    }

    private function assertRoleHasPermissions(string $roleNamespace, array $permissions): void
    {
        $role = Role::namespace($roleNamespace);
        $actual = DB::table('nexopos_role_permission')
            ->join('nexopos_permissions', 'nexopos_permissions.id', '=', 'nexopos_role_permission.permission_id')
            ->where('nexopos_role_permission.role_id', $role->id)
            ->orderBy('nexopos_permissions.id')
            ->pluck('nexopos_permissions.namespace')
            ->all();

        $this->assertSame($permissions, $actual);
    }

    private function accountAttributes(int $customerId, string $number, int $tierId, string $status = 'active'): array
    {
        return [
            'customer_id' => $customerId,
            'membership_number' => $number,
            'normalized_phone' => '+60123456789',
            'status' => $status,
            'available_coin_balance' => 0,
            'lifetime_earned_coins' => 0,
            'current_tier_id' => $tierId,
            'joined_at' => now(),
        ];
    }

    private function transactionAttributes(
        int $accountId,
        int $customerId,
        string $action,
        string $sourceType,
        string $sourceId,
        string $idempotencyKey
    ): array {
        $rule = MembershipRuleVersion::query()->sole();

        return [
            'account_id' => $accountId,
            'customer_id' => $customerId,
            'action' => $action,
            'balance_delta' => 1,
            'lifetime_delta' => 1,
            'balance_after' => 1,
            'lifetime_after' => 1,
            'source_type' => $sourceType,
            'source_id' => $sourceId,
            'idempotency_key' => $idempotencyKey,
            'payload_fingerprint' => hash('sha256', "{$accountId}|{$action}|{$sourceType}|{$sourceId}"),
            'reason' => 'test transaction',
            'rule_version_id' => $rule->id,
            'rule_version_snapshot' => [
                'earning_spend_amount' => $rule->earning_spend_amount,
                'coins_earned' => $rule->coins_earned,
                'redemption_coins' => $rule->redemption_coins,
                'redemption_value' => $rule->redemption_value,
            ],
            'metadata' => ['test' => true],
        ];
    }

    private function expectDatabaseConstraint(callable $operation): void
    {
        try {
            $operation();
            $this->fail('Expected a database uniqueness constraint violation.');
        } catch (\Illuminate\Database\QueryException) {
            $this->assertTrue(true);
        }
    }

    private function sqliteColumns(string $table): array
    {
        return collect(DB::select("PRAGMA table_info('" . DB::getTablePrefix() . $table . "')"))
            ->keyBy('name')
            ->map(fn ($column) => (array) $column)
            ->all();
    }
}
