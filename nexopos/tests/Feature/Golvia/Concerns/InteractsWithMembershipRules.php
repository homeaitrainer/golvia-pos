<?php

namespace Tests\Feature\Golvia\Concerns;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;
use Illuminate\Database\Schema\Blueprint;
use Laravel\Sanctum\Sanctum;

trait InteractsWithMembershipRules
{
    private const FOUNDATION_MIGRATION = 'modules/GolviaMembership/Migrations/2026_09_07_000001_create_membership_foundation.php';

    private const RULES_MIGRATION = 'modules/GolviaMembership/Migrations/2026_09_08_000002_add_membership_recalculation_progress.php';

    protected function setUpMembershipRules(): void
    {
        config(['app.key' => 'base64:' . base64_encode(random_bytes(32))]);
        $this->loadMembershipClasses();

        foreach ([
            'golvia_membership_settings_audits',
            'golvia_coin_transactions',
            'golvia_membership_accounts',
            'golvia_membership_tiers',
            'golvia_membership_rule_versions',
        ] as $table) {
            Schema::dropIfExists($table);
        }

        $this->ensureCoreAuthorizationTables();

        (require base_path(self::FOUNDATION_MIGRATION))->up();
        if (is_file(base_path(self::RULES_MIGRATION))) {
            (require base_path(self::RULES_MIGRATION))->up();
        }

        foreach (Permission::query()->where('namespace', 'like', 'golvia.membership.%')->pluck('namespace') as $permission) {
            Gate::define($permission, fn (User $user): bool => DB::table('nexopos_users_roles_relations')
                ->join('nexopos_role_permission', 'nexopos_role_permission.role_id', '=', 'nexopos_users_roles_relations.role_id')
                ->join('nexopos_permissions', 'nexopos_permissions.id', '=', 'nexopos_role_permission.permission_id')
                ->where('nexopos_users_roles_relations.user_id', $user->id)
                ->where('nexopos_permissions.namespace', $permission)
                ->exists());
        }

        if (is_file(base_path('modules/GolviaMembership/Routes/api.php'))) {
            Route::middleware('api')->prefix('api')->group(base_path('modules/GolviaMembership/Routes/api.php'));
        }
    }

    private function loadMembershipClasses(): void
    {
        foreach ([
            'Models/RetainedRecordBuilder.php',
            'Models/AppendOnlyBuilder.php',
            'Models/RuleVersionBuilder.php',
            'Models/TierVersionBuilder.php',
            'Models/MembershipAccount.php',
            'Models/MembershipTier.php',
            'Models/MembershipRuleVersion.php',
            'Models/SettingsAudit.php',
            'Settings/MembershipSettings.php',
            'Services/TierResolver.php',
            'Services/MembershipSettingsService.php',
            'Services/TierManagementService.php',
            'Jobs/RecalculateMembershipTierChunk.php',
            'Console/Commands/RecalculateMembershipTiers.php',
            'Http/Requests/UpdateMembershipSettingsRequest.php',
            'Http/Requests/UpdateTierRequest.php',
            'Http/Controllers/MembershipSettingsController.php',
            'Http/Controllers/TierController.php',
        ] as $file) {
            $path = base_path('modules/GolviaMembership/' . $file);
            if (is_file($path)) {
                require_once $path;
            }
        }
    }

    private function ensureCoreAuthorizationTables(): void
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
        if (! Schema::hasTable('nexopos_permissions')) {
            Schema::create('nexopos_permissions', function (Blueprint $table): void {
                $table->increments('id');
                $table->string('name')->unique();
                $table->string('namespace')->unique();
                $table->text('description');
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
        if (! Schema::hasTable('nexopos_users')) {
            Schema::create('nexopos_users', function (Blueprint $table): void {
                $table->increments('id');
                $table->string('username')->nullable();
                $table->boolean('active')->default(true);
                $table->string('email')->unique();
                $table->string('password');
                $table->rememberToken();
                $table->timestamps();
            });
        }
        if (! Schema::hasTable('nexopos_users_roles_relations')) {
            Schema::create('nexopos_users_roles_relations', function (Blueprint $table): void {
                $table->id();
                $table->integer('role_id');
                $table->integer('user_id');
                $table->timestamps();
            });
        }

        foreach ([Role::ADMIN => 'Administrator', Role::STOREADMIN => 'Store Administrator', Role::STORECASHIER => 'Store Cashier'] as $namespace => $name) {
            Role::query()->firstOrCreate(['namespace' => $namespace], ['name' => $name, 'description' => $name]);
        }
    }

    protected function tearDownMembershipRules(): void
    {
        if (Schema::hasTable('nexopos_roles')) {
            $roleIds = DB::table('nexopos_roles')->where('namespace', 'like', 'golvia.test.%')->pluck('id');
            DB::table('nexopos_users_roles_relations')->whereIn('role_id', $roleIds)->delete();
            DB::table('nexopos_role_permission')->whereIn('role_id', $roleIds)->delete();
            DB::table('nexopos_roles')->whereIn('id', $roleIds)->delete();
        }
        if (Schema::hasTable('nexopos_users')) {
            DB::table('nexopos_users')->where('email', 'like', '%@golvia.test')->delete();
        }
        if (Schema::hasColumn('golvia_membership_rule_versions', 'recalculation_last_account_id')
            || Schema::hasColumn('golvia_membership_rule_versions', 'recalculation_processed_accounts')
            || Schema::hasColumn('golvia_membership_accounts', 'tier_evaluated_at')) {
            (require base_path(self::RULES_MIGRATION))->down();
        }
        if (Schema::hasTable('golvia_membership_rule_versions')) {
            (require base_path(self::FOUNDATION_MIGRATION))->down();
        }
    }

    protected function authenticateWithPermission(string $permission): User
    {
        $user = User::query()->create([
            'username' => 'golvia-' . str()->random(12),
            'email' => str()->random(12) . '@golvia.test',
            'password' => bcrypt('secret'),
            'active' => true,
        ]);
        $role = Role::query()->create([
            'namespace' => 'golvia.test.' . str()->random(12),
            'name' => 'GOLVIA test role ' . str()->random(8),
            'description' => 'Test role',
        ]);
        DB::table('nexopos_users_roles_relations')->insert([
            'user_id' => $user->id,
            'role_id' => $role->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $role->addPermissions($permission);
        Cache::forget('ns-all-permissions-' . $user->id);
        Sanctum::actingAs($user, ['*']);

        return $user;
    }

    protected function authenticateWithoutMembershipPermissions(): User
    {
        $user = User::query()->create([
            'username' => 'golvia-unprivileged-' . str()->random(8),
            'email' => str()->random(12) . '@golvia.test',
            'password' => bcrypt('secret'),
            'active' => true,
        ]);
        Sanctum::actingAs($user, ['*']);

        return $user;
    }
}
