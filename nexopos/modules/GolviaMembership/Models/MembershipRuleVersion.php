<?php

namespace Modules\GolviaMembership\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Model;
use LogicException;

class MembershipRuleVersion extends Model
{
    private bool $allowsActivationMutation = false;

    public const STATE_DRAFT = 'draft';

    public const STATE_ACTIVE = 'active';

    public const STATE_RETIRED = 'retired';

    public const RECALCULATION_PENDING = 'pending';

    public const RECALCULATION_RUNNING = 'running';

    public const RECALCULATION_COMPLETED = 'completed';

    public const RECALCULATION_FAILED = 'failed';

    protected $table = 'golvia_membership_rule_versions';

    protected $guarded = ['id'];

    protected $casts = [
        'enabled' => 'boolean',
        'earning_spend_amount' => 'decimal:2',
        'coins_earned' => 'integer',
        'redemption_coins' => 'integer',
        'redemption_value' => 'decimal:2',
        'effective_at' => 'datetime',
        'recalculation_last_account_id' => 'integer',
        'recalculation_processed_accounts' => 'integer',
    ];

    protected static function booted(): void
    {
        static::updating(function (self $version): void {
            if ($version->isDirty([
                'version_key',
                'enabled',
                'earning_spend_amount',
                'coins_earned',
                'redemption_coins',
                'redemption_value',
            ])) {
                throw new LogicException('Published membership financial rules are immutable.');
            }
            if (! $version->allowsActivationMutation && $version->isDirty([
                'activation_state',
                'effective_at',
                'actor_id',
            ])) {
                throw new LogicException('Membership activation metadata is domain-managed and immutable.');
            }
        });
        static::deleting(fn () => throw new LogicException('Membership rule versions are retained, not deleted.'));
    }

    public function newEloquentBuilder($query): RuleVersionBuilder
    {
        return new RuleVersionBuilder($query);
    }

    public function activateBy(int $actorId, CarbonInterface $effectiveAt): void
    {
        if ($this->activation_state !== self::STATE_DRAFT) {
            throw new LogicException('Only a draft membership rule can be activated.');
        }

        $this->allowsActivationMutation = true;
        try {
            $this->forceFill([
                'activation_state' => self::STATE_ACTIVE,
                'actor_id' => $actorId,
                'effective_at' => $effectiveAt,
                'recalculation_state' => self::RECALCULATION_PENDING,
                'recalculation_last_account_id' => 0,
                'recalculation_processed_accounts' => 0,
            ])->save();
        } finally {
            $this->allowsActivationMutation = false;
        }
    }

    public function allowsActivationMutation(): bool
    {
        return $this->allowsActivationMutation;
    }

    public function retireByDomain(): void
    {
        if ($this->activation_state !== self::STATE_ACTIVE) {
            throw new LogicException('Only an active membership rule can be retired.');
        }

        $this->allowsActivationMutation = true;
        try {
            $this->forceFill(['activation_state' => self::STATE_RETIRED])->save();
        } finally {
            $this->allowsActivationMutation = false;
        }
    }
}
