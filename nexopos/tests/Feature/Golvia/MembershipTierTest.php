<?php

namespace Tests\Feature\Golvia;

require_once __DIR__ . '/Concerns/InteractsWithMembershipRules.php';

use Carbon\Carbon;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;
use Modules\GolviaMembership\Console\Commands\RecalculateMembershipTiers;
use Modules\GolviaMembership\Jobs\RecalculateMembershipTierChunk;
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
    use InteractsWithMembershipRules;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpMembershipRules();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
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

    public function test_activation_records_actor_effective_time_and_audit_then_dispatches_after_commit(): void
    {
        Bus::fake();
        $user = $this->authenticateWithPermission('golvia.membership.manage-tiers');
        $active = MembershipRuleVersion::query()->where('activation_state', 'active')->sole();
        $draftId = $this->patchJson('/api/golvia-membership/tiers', ['tiers' => $this->compactTiers()])
            ->assertCreated()
            ->json('data.id');
        $draftCreatedAt = MembershipRuleVersion::query()->findOrFail($draftId)->effective_at;
        $activationTime = Carbon::parse('2026-09-08 10:15:30', 'Asia/Kuala_Lumpur');
        Carbon::setTestNow($activationTime);

        $this->postJson("/api/golvia-membership/tier-versions/{$draftId}/activate")
            ->assertOk()
            ->assertJsonPath('data.recalculation_state', 'pending');

        $activated = MembershipRuleVersion::query()->findOrFail($draftId);
        $this->assertSame($user->id, $activated->actor_id);
        $this->assertTrue($activated->effective_at->equalTo($activationTime));
        $this->assertFalse($activated->effective_at->equalTo($draftCreatedAt));
        $audit = SettingsAudit::query()->where('rule_version_id', $draftId)->latest('id')->firstOrFail();
        $this->assertSame($user->id, $audit->actor_id);
        $this->assertSame('draft', $audit->old_values['activation_state']);
        $this->assertSame('active', $audit->new_values['activation_state']);
        $this->assertSame($active->id, $audit->new_values['previous_active_rule_version_id']);
        $this->assertTrue($audit->effective_at->equalTo($activationTime));
        Bus::assertDispatched(RecalculateMembershipTierChunk::class, fn ($job) => $job->ruleVersionId === $draftId);
        try {
            $activated->update(['activation_state' => MembershipRuleVersion::STATE_RETIRED]);
            $this->fail('Activation state must only change through the domain transition methods.');
        } catch (\LogicException) {
            $this->assertTrue(true);
        }
        Carbon::setTestNow();
    }

    public function test_job_processes_one_bounded_chunk_and_resumes_in_primary_key_order(): void
    {
        Bus::fake();
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
                'tier_evaluated_at' => null,
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
        foreach ([
            fn () => $draftTier->update(['is_active' => false]),
            fn () => MembershipTier::query()->whereKey($draftTier->id)->update(['is_active' => false]),
        ] as $mutation) {
            try {
                $mutation();
                $this->fail('A versioned tier active flag must be immutable.');
            } catch (\LogicException) {
                $this->assertTrue(true);
            }
        }

        $this->postJson("/api/golvia-membership/tier-versions/{$draftId}/activate")
            ->assertOk()
            ->assertJsonPath('data.recalculation_state', 'pending');
        $this->assertSame('retired', $active->fresh()->activation_state);

        $job = new RecalculateMembershipTierChunk($draftId, 2);
        $job->handle(app(TierManagementService::class));
        $first = MembershipRuleVersion::query()->findOrFail($draftId);
        $this->assertSame('running', $first->recalculation_state);
        $this->assertSame(20, $first->recalculation_last_account_id);
        $this->assertSame(2, $first->recalculation_processed_accounts);
        $this->assertNotSame($white->id, MembershipAccount::query()->findOrFail(20)->current_tier_id);
        $this->assertNotNull(MembershipAccount::query()->findOrFail(20)->tier_evaluated_at);
        $this->assertSame($white->id, MembershipAccount::query()->findOrFail(30)->current_tier_id);
        $this->assertNull(MembershipAccount::query()->findOrFail(30)->tier_evaluated_at);

        $job->handle(app(TierManagementService::class));
        $second = MembershipRuleVersion::query()->findOrFail($draftId);
        $this->assertSame(40, $second->recalculation_last_account_id);
        $this->assertSame(4, $second->recalculation_processed_accounts);

        $job->handle(app(TierManagementService::class));
        $final = MembershipRuleVersion::query()->findOrFail($draftId);
        $this->assertSame('completed', $final->recalculation_state);
        $this->assertSame(50, $final->recalculation_last_account_id);
        $this->assertSame(5, $final->recalculation_processed_accounts);

        $job->handle(app(TierManagementService::class));
        $this->assertSame(5, MembershipRuleVersion::query()->findOrFail($draftId)->recalculation_processed_accounts);

        $expected = [10 => 'white', 20 => 'silver', 30 => 'gold', 40 => 'platinum', 50 => 'platinum'];
        foreach ($expected as $id => $key) {
            $tierId = MembershipAccount::query()->findOrFail($id)->current_tier_id;
            $this->assertSame($key, MembershipTier::query()->findOrFail($tierId)->key);
        }
    }

    public function test_command_fallback_processes_pending_versions_and_terminal_failure_is_visible(): void
    {
        Bus::fake();
        $this->authenticateWithPermission('golvia.membership.manage-tiers');
        $draft = app(TierManagementService::class)->createDraft($this->compactTiers(), 1);
        app(TierManagementService::class)->activate($draft, 1);

        $kernel = $this->app->make(\Illuminate\Contracts\Console\Kernel::class);
        $kernel->registerCommand(new RecalculateMembershipTiers(app(TierManagementService::class)));
        $this->artisan('golvia:membership-recalculate-tiers', ['--chunk' => 2])->assertSuccessful();
        $this->assertSame('completed', $draft->fresh()->recalculation_state);

        $draft2 = app(TierManagementService::class)->createDraft($this->defaultTiers(), 1);
        app(TierManagementService::class)->activate($draft2, 1);
        (new RecalculateMembershipTierChunk($draft2->id, 100))->failed(new \RuntimeException('terminal'));
        $this->assertSame('failed', $draft2->fresh()->recalculation_state);
    }

    public function test_service_rejects_invalid_chunk_sizes(): void
    {
        $version = MembershipRuleVersion::query()->where('activation_state', 'active')->sole();

        foreach ([0, 501] as $chunkSize) {
            try {
                app(TierManagementService::class)->recalculateChunk($version, $chunkSize);
                $this->fail('Invalid chunk sizes must be rejected at the service boundary.');
            } catch (\InvalidArgumentException) {
                $this->assertTrue(true);
            }
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
