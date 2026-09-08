<?php

namespace Tests\Feature\Golvia;

require_once __DIR__ . '/Concerns/InteractsWithMembershipRules.php';

use Illuminate\Foundation\Testing\DatabaseTransactions;
use LogicException;
use Modules\GolviaMembership\Models\MembershipRuleVersion;
use Modules\GolviaMembership\Models\SettingsAudit;
use Modules\GolviaMembership\Services\MembershipSettingsService;
use Modules\GolviaMembership\Settings\MembershipSettings;
use Tests\Feature\Golvia\Concerns\InteractsWithMembershipRules;
use Tests\TestCase;

class MembershipSettingsTest extends TestCase
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

    public function test_settings_are_not_autoloaded_and_defaults_expose_integer_sen(): void
    {
        $this->assertFalse(MembershipSettings::AUTOLOAD);
        $settings = app(MembershipSettingsService::class)->current();

        $this->assertSame(true, $settings['enabled']);
        $this->assertSame('3.00', $settings['earning_spend_amount']);
        $this->assertSame(300, $settings['earning_spend_sen']);
        $this->assertSame(1, $settings['coins_earned']);
        $this->assertSame(100, $settings['redemption_coins']);
        $this->assertSame('1.00', $settings['redemption_value']);
        $this->assertSame(100, $settings['redemption_value_sen']);
    }

    public function test_settings_endpoints_require_authentication_and_permission(): void
    {
        $this->getJson('/api/golvia-membership/settings')->assertUnauthorized();
        $this->patchJson('/api/golvia-membership/settings', $this->validPayload())->assertUnauthorized();

        $this->authenticateWithoutMembershipPermissions();
        $this->getJson('/api/golvia-membership/settings')->assertForbidden();
        $this->patchJson('/api/golvia-membership/settings', $this->validPayload())->assertForbidden();
    }

    public function test_authorized_patch_creates_immutable_effective_version_and_audit(): void
    {
        $user = $this->authenticateWithPermission('golvia.membership.manage-settings');
        $original = MembershipRuleVersion::query()->where('activation_state', 'active')->sole();

        $response = $this->patchJson('/api/golvia-membership/settings', [
            ...$this->validPayload(),
            'earning_spend_amount' => '12.30',
            'redemption_value' => '4.56',
        ])->assertOk();

        $response->assertJsonPath('data.earning_spend_sen', 1230);
        $response->assertJsonPath('data.redemption_value_sen', 456);
        $replacement = MembershipRuleVersion::query()->where('activation_state', 'active')->sole();
        $this->assertNotSame($original->id, $replacement->id);
        $this->assertSame('retired', $original->fresh()->activation_state);
        $this->assertSame($user->id, $replacement->actor_id);
        $this->assertSame('12.30', $replacement->earning_spend_amount);
        $this->assertSame(1, SettingsAudit::query()->where('rule_version_id', $replacement->id)->count());
        $this->assertSame('3.00', SettingsAudit::query()->sole()->old_values['earning_spend_amount']);
        $this->assertSame('12.30', SettingsAudit::query()->sole()->new_values['earning_spend_amount']);

        $this->expectException(LogicException::class);
        $replacement->update(['earning_spend_amount' => '9.99']);
    }

    public function test_settings_reject_non_positive_or_non_decimal_financial_values(): void
    {
        $this->authenticateWithPermission('golvia.membership.manage-settings');

        foreach ([
            ['earning_spend_amount' => '0.00'],
            ['earning_spend_amount' => '-3.00'],
            ['earning_spend_amount' => '3.001'],
            ['coins_earned' => 0],
            ['redemption_coins' => -1],
            ['redemption_value' => '0'],
            ['redemption_value' => 1.005],
        ] as $invalid) {
            $this->patchJson('/api/golvia-membership/settings', [
                ...$this->validPayload(),
                ...$invalid,
            ])->assertUnprocessable();
        }

        $this->assertSame(1, MembershipRuleVersion::query()->count());
        $this->assertSame(0, SettingsAudit::query()->count());
    }

    private function validPayload(): array
    {
        return [
            'enabled' => true,
            'earning_spend_amount' => '3.00',
            'coins_earned' => 1,
            'redemption_coins' => 100,
            'redemption_value' => '1.00',
        ];
    }
}
