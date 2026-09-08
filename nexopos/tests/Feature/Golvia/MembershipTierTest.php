<?php

namespace Tests\Feature\Golvia;

require_once __DIR__ . '/Concerns/InteractsWithMembershipRules.php';

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Modules\GolviaMembership\Models\MembershipAccount;
use Modules\GolviaMembership\Models\MembershipRuleVersion;
use Modules\GolviaMembership\Models\MembershipTier;
use Modules\GolviaMembership\Models\SettingsAudit;
use Modules\GolviaMembership\Services\TierManagementService;
use Modules\GolviaMembership\Services\TierResolver;
use Tests\Feature\Golvia\Concerns\InteractsWithMembershipRules;
use Tests\TestCase;

class MembershipTierTest extends TestCase
{
    use DatabaseTransactions;
    use InteractsWithMembershipRules;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpMembershipRules();
    }

    protected function tearDown(): void
    {
        $this->tearDownMembershipRules();
        parent::tearDown();
    }

    public function test_resolver_honors_every_approved_default_boundary(): void
    {
        $resolver = app(TierResolver::class);

        foreach ([0 => 'white', 3000 => 'white', 3001 => 'silver', 5000 => 'silver', 5001 => 'gold', 12000 => 'gold', 12001 => 'platinum'] as $coins => $expected) {
            $this->assertSame($expected, $resolver->resolve($coins)->key);
        }
    }

    public function test_tier_mutations_require_authentication_and_manage_tiers_permission(): void
    {
        $draft = app(TierManagementService::class)->createDraft($this->defaultTiers(), 1);
        $this->patchJson('/api/golvia-membership/tiers', ['tiers' => $this->defaultTiers()])->assertUnauthorized();
        $this->postJson("/api/golvia-membership/tier-versions/{$draft->id}/activate")->assertUnauthorized();
        $this->postJson("/api/golvia-membership/tier-versions/{$draft->id}/recalculate")->assertUnauthorized();

        $this->authenticateWithoutMembershipPermissions();
        $this->patchJson('/api/golvia-membership/tiers', ['tiers' => $this->defaultTiers()])->assertForbidden();
        $this->postJson("/api/golvia-membership/tier-versions/{$draft->id}/activate")->assertForbidden();
        $this->postJson("/api/golvia-membership/tier-versions/{$draft->id}/recalculate")->assertForbidden();
    }

    public function test_tier_validation_rejects_gaps_overlaps_duplicates_bounds_and_multiple_open_ends(): void
    {
        $this->authenticateWithPermission('golvia.membership.manage-tiers');

        $invalidSets = [
            array_replace_recursive($this->defaultTiers(), [1 => ['minimum_lifetime_coins' => 3002]]),
            array_replace_recursive($this->defaultTiers(), [1 => ['minimum_lifetime_coins' => 3000]]),
            array_replace_recursive($this->defaultTiers(), [1 => ['key' => 'white']]),
            array_replace_recursive($this->defaultTiers(), [0 => ['minimum_lifetime_coins' => -1]]),
            array_replace_recursive($this->defaultTiers(), [0 => ['discount_percent' => '100.01']]),
            array_replace_recursive($this->defaultTiers(), [2 => ['maximum_lifetime_coins' => null]]),
            array_replace_recursive($this->defaultTiers(), [0 => ['maximum_lifetime_coins' => 0]]),
        ];

        foreach ($invalidSets as $tiers) {
            $this->patchJson('/api/golvia-membership/tiers', ['tiers' => $tiers])->assertUnprocessable();
        }

        $this->assertSame(1, MembershipRuleVersion::query()->count());
    }

    public function test_domain_service_rejects_invalid_topology_even_without_an_http_request(): void
    {
        $invalid = array_replace_recursive($this->defaultTiers(), [1 => ['minimum_lifetime_coins' => 3002]]);

        $this->expectException(\InvalidArgumentException::class);
        app(TierManagementService::class)->createDraft($invalid, 1);
    }

    public function test_activation_and_recalculation_are_resumable_chunked_and_primary_key_ordered(): void
    {
        $this->authenticateWithPermission('golvia.membership.manage-tiers');
        $active = MembershipRuleVersion::query()->where('activation_state', 'active')->sole();
        $white = MembershipTier::query()->where('rule_version_id', $active->id)->where('key', 'white')->sole();

        foreach ([10 => 0, 20 => 1, 30 => 2, 40 => 3, 50 => 4] as $id => $coins) {
            MembershipAccount::unguarded(fn () => MembershipAccount::query()->create([
                'id' => $id,
                'customer_id' => 1000 + $id,
                'membership_number' => 'GOL-' . $id,
                'status' => 'active',
                'available_coin_balance' => $coins,
                'lifetime_earned_coins' => $coins,
                'current_tier_id' => $white->id,
                'joined_at' => now(),
            ]));
        }

        $draftId = $this->patchJson('/api/golvia-membership/tiers', ['tiers' => $this->compactTiers()])
            ->assertCreated()
            ->json('data.id');
        $this->assertSame('draft', MembershipRuleVersion::query()->findOrFail($draftId)->activation_state);
        $this->assertSame(1, SettingsAudit::query()->where('rule_version_id', $draftId)->count());
        $draftTier = MembershipTier::query()->where('rule_version_id', $draftId)->where('key', 'white')->sole();
        try {
            $draftTier->update(['minimum_lifetime_coins' => 99]);
            $this->fail('Effective-dated tier boundaries must be immutable.');
        } catch (\LogicException) {
            $this->assertTrue(true);
        }

        $this->postJson("/api/golvia-membership/tier-versions/{$draftId}/activate")
            ->assertOk()
            ->assertJsonPath('data.recalculation_state', 'pending');
        $this->assertSame('retired', $active->fresh()->activation_state);

        $first = $this->postJson("/api/golvia-membership/tier-versions/{$draftId}/recalculate", ['chunk_size' => 2])
            ->assertOk();
        $first->assertJsonPath('data.recalculation_state', 'running');
        $first->assertJsonPath('data.recalculation_last_account_id', 20);
        $first->assertJsonPath('data.recalculation_processed_accounts', 2);
        $this->assertNotSame($white->id, MembershipAccount::query()->findOrFail(20)->current_tier_id);
        $this->assertSame($white->id, MembershipAccount::query()->findOrFail(30)->current_tier_id);

        $this->postJson("/api/golvia-membership/tier-versions/{$draftId}/recalculate", ['chunk_size' => 2])
            ->assertOk()
            ->assertJsonPath('data.recalculation_last_account_id', 40)
            ->assertJsonPath('data.recalculation_processed_accounts', 4);

        $final = $this->postJson("/api/golvia-membership/tier-versions/{$draftId}/recalculate", ['chunk_size' => 2])
            ->assertOk();
        $final->assertJsonPath('data.recalculation_state', 'completed');
        $final->assertJsonPath('data.recalculation_last_account_id', 50);
        $final->assertJsonPath('data.recalculation_processed_accounts', 5);

        $replay = $this->postJson("/api/golvia-membership/tier-versions/{$draftId}/recalculate", ['chunk_size' => 2])
            ->assertOk();
        $replay->assertJsonPath('data.recalculation_processed_accounts', 5);

        $expected = [10 => 'white', 20 => 'silver', 30 => 'gold', 40 => 'platinum', 50 => 'platinum'];
        foreach ($expected as $id => $key) {
            $tierId = MembershipAccount::query()->findOrFail($id)->current_tier_id;
            $this->assertSame($key, MembershipTier::query()->findOrFail($tierId)->key);
        }
    }

    private function defaultTiers(): array
    {
        return [
            ['key' => 'white', 'name' => 'White', 'minimum_lifetime_coins' => 0, 'maximum_lifetime_coins' => 3000, 'discount_percent' => '0.00'],
            ['key' => 'silver', 'name' => 'Silver', 'minimum_lifetime_coins' => 3001, 'maximum_lifetime_coins' => 5000, 'discount_percent' => '0.00'],
            ['key' => 'gold', 'name' => 'Gold', 'minimum_lifetime_coins' => 5001, 'maximum_lifetime_coins' => 12000, 'discount_percent' => '0.00'],
            ['key' => 'platinum', 'name' => 'Platinum', 'minimum_lifetime_coins' => 12001, 'maximum_lifetime_coins' => null, 'discount_percent' => '0.00'],
        ];
    }

    private function compactTiers(): array
    {
        return [
            ['key' => 'white', 'name' => 'White', 'minimum_lifetime_coins' => 0, 'maximum_lifetime_coins' => 0, 'discount_percent' => '0.00'],
            ['key' => 'silver', 'name' => 'Silver', 'minimum_lifetime_coins' => 1, 'maximum_lifetime_coins' => 1, 'discount_percent' => '1.25'],
            ['key' => 'gold', 'name' => 'Gold', 'minimum_lifetime_coins' => 2, 'maximum_lifetime_coins' => 2, 'discount_percent' => '2.50'],
            ['key' => 'platinum', 'name' => 'Platinum', 'minimum_lifetime_coins' => 3, 'maximum_lifetime_coins' => null, 'discount_percent' => '3.75'],
        ];
    }
}
