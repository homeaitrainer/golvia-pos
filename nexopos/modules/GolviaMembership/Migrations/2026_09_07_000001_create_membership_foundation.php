<?php

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const PERMISSIONS = [
        'golvia.membership.pos-summary' => ['GOLVIA membership POS summary', 'View customer membership summary in the POS.'],
        'golvia.membership.read' => ['Read GOLVIA membership', 'View membership accounts, tiers, and coin activity.'],
        'golvia.membership.manage' => ['Manage GOLVIA membership', 'Manage membership accounts and operations.'],
        'golvia.membership.adjust-coins' => ['Adjust GOLVIA coins', 'Post authorized manual coin adjustments.'],
        'golvia.membership.manage-tiers' => ['Manage GOLVIA tiers', 'Configure and activate lifetime membership tiers.'],
        'golvia.membership.manage-settings' => ['Manage GOLVIA membership settings', 'Configure membership earning and redemption rules.'],
    ];

    public function up(): void
    {
        $this->createTables();
        $this->seedDefaults();
        $this->seedPermissions();
    }

    public function down(): void
    {
        if (Schema::hasTable('nexopos_permissions')) {
            Permission::query()
                ->whereIn('namespace', array_keys(self::PERMISSIONS))
                ->get()
                ->each(function (Permission $permission): void {
                    $permission->removeFromRoles();
                    $permission->delete();
                });
        }

        Schema::dropIfExists('golvia_membership_settings_audits');
        Schema::dropIfExists('golvia_coin_transactions');
        Schema::dropIfExists('golvia_membership_accounts');
        Schema::dropIfExists('golvia_membership_tiers');
        Schema::dropIfExists('golvia_membership_rule_versions');
    }

    private function createTables(): void
    {
        if (! Schema::hasTable('golvia_membership_rule_versions')) {
            Schema::create('golvia_membership_rule_versions', function (Blueprint $table): void {
                $table->bigIncrements('id');
                $table->boolean('enabled')->default(true);
                $table->decimal('earning_spend_amount', 12, 2);
                $table->unsignedBigInteger('coins_earned');
                $table->unsignedBigInteger('redemption_coins');
                $table->decimal('redemption_value', 12, 2);
                $table->string('activation_state', 24)->index();
                $table->string('recalculation_state', 24)->index();
                $table->unsignedBigInteger('actor_id')->nullable();
                $table->timestamp('effective_at')->index();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('golvia_membership_tiers')) {
            Schema::create('golvia_membership_tiers', function (Blueprint $table): void {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('rule_version_id')->index();
                $table->string('key', 40);
                $table->string('name', 80);
                $table->unsignedBigInteger('minimum_lifetime_coins');
                $table->unsignedBigInteger('maximum_lifetime_coins')->nullable();
                $table->decimal('discount_percent', 5, 2)->default(0);
                $table->unsignedInteger('display_order');
                $table->boolean('is_active')->default(true)->index();
                $table->timestamps();

                $table->unique(['rule_version_id', 'key'], 'golvia_tiers_rule_key_unique');
                $table->unique(['rule_version_id', 'display_order'], 'golvia_tiers_rule_order_unique');
            });
        }

        if (! Schema::hasTable('golvia_membership_accounts')) {
            Schema::create('golvia_membership_accounts', function (Blueprint $table): void {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('customer_id')->unique();
                $table->string('membership_number', 64)->unique();
                $table->string('normalized_phone', 32)->nullable()->index();
                $table->string('status', 24)->default('active')->index();
                $table->bigInteger('available_coin_balance')->default(0);
                $table->bigInteger('lifetime_earned_coins')->default(0);
                $table->unsignedBigInteger('current_tier_id')->index();
                $table->timestamp('joined_at');
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('golvia_coin_transactions')) {
            Schema::create('golvia_coin_transactions', function (Blueprint $table): void {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('account_id')->index();
                $table->unsignedBigInteger('customer_id')->index();
                $table->string('action', 32)->index();
                $table->bigInteger('balance_delta');
                $table->bigInteger('lifetime_delta');
                $table->bigInteger('balance_after');
                $table->bigInteger('lifetime_after');
                $table->string('source_type', 80);
                $table->string('source_id', 191);
                $table->string('idempotency_key', 191)->unique();
                $table->char('payload_fingerprint', 64);
                $table->text('reason')->nullable();
                $table->unsignedBigInteger('author_id')->nullable();
                $table->unsignedBigInteger('rule_version_id')->nullable()->index();
                $table->json('rule_version_snapshot')->nullable();
                $table->json('metadata')->nullable();
                $table->timestamps();

                $table->unique(
                    ['account_id', 'action', 'source_type', 'source_id'],
                    'golvia_coin_source_action_unique'
                );
            });
        }

        if (! Schema::hasTable('golvia_membership_settings_audits')) {
            Schema::create('golvia_membership_settings_audits', function (Blueprint $table): void {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('rule_version_id')->index();
                $table->json('old_values')->nullable();
                $table->json('new_values');
                $table->unsignedBigInteger('actor_id');
                $table->timestamp('effective_at')->index();
                $table->timestamps();
            });
        }
    }

    private function seedDefaults(): void
    {
        if (DB::table('golvia_membership_rule_versions')->exists()) {
            return;
        }

        $now = now();
        $ruleVersionId = DB::table('golvia_membership_rule_versions')->insertGetId([
            'enabled' => true,
            'earning_spend_amount' => '3.00',
            'coins_earned' => 1,
            'redemption_coins' => 100,
            'redemption_value' => '1.00',
            'activation_state' => 'active',
            'recalculation_state' => 'completed',
            'actor_id' => null,
            'effective_at' => $now,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        DB::table('golvia_membership_tiers')->insert([
            $this->tier($ruleVersionId, 'white', 'White', 0, 3000, 1, $now),
            $this->tier($ruleVersionId, 'silver', 'Silver', 3001, 5000, 2, $now),
            $this->tier($ruleVersionId, 'gold', 'Gold', 5001, 12000, 3, $now),
            $this->tier($ruleVersionId, 'platinum', 'Platinum', 12001, null, 4, $now),
        ]);
    }

    private function seedPermissions(): void
    {
        if (! Schema::hasTable('nexopos_permissions') || ! Schema::hasTable('nexopos_roles')) {
            return;
        }

        foreach (self::PERMISSIONS as $namespace => [$name, $description]) {
            Permission::query()->firstOrCreate(
                ['namespace' => $namespace],
                ['name' => $name, 'description' => $description]
            );
        }

        $all = array_keys(self::PERMISSIONS);
        foreach ([Role::ADMIN, Role::STOREADMIN] as $namespace) {
            $role = Role::namespace($namespace);
            if ($role instanceof Role) {
                $role->addPermissions($all);
            }
        }

        $cashier = Role::namespace(Role::STORECASHIER);
        if ($cashier instanceof Role) {
            $cashier->addPermissions('golvia.membership.pos-summary');
        }
    }

    private function tier(
        int $ruleVersionId,
        string $key,
        string $name,
        int $minimum,
        ?int $maximum,
        int $displayOrder,
        mixed $now
    ): array {
        return [
            'rule_version_id' => $ruleVersionId,
            'key' => $key,
            'name' => $name,
            'minimum_lifetime_coins' => $minimum,
            'maximum_lifetime_coins' => $maximum,
            'discount_percent' => '0.00',
            'display_order' => $displayOrder,
            'is_active' => true,
            'created_at' => $now,
            'updated_at' => $now,
        ];
    }
};
