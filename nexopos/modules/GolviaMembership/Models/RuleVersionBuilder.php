<?php

namespace Modules\GolviaMembership\Models;

use LogicException;

class RuleVersionBuilder extends RetainedRecordBuilder
{
    private const IMMUTABLE_FIELDS = [
        'version_key',
        'enabled',
        'earning_spend_amount',
        'coins_earned',
        'redemption_coins',
        'redemption_value',
    ];

    private const ACTIVATION_FIELDS = ['activation_state', 'effective_at', 'actor_id'];

    public function update(array $values)
    {
        if (array_intersect(array_keys($values), self::IMMUTABLE_FIELDS) !== []) {
            throw new LogicException('Published membership rule values cannot be bulk updated.');
        }
        if (array_intersect(array_keys($values), self::ACTIVATION_FIELDS) !== []
            && ! $this->getModel()->allowsActivationMutation()) {
            throw new LogicException('Membership activation metadata cannot be bulk updated.');
        }

        return parent::update($values);
    }
}
