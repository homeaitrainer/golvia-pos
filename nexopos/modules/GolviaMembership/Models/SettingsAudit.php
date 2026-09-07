<?php

namespace Modules\GolviaMembership\Models;

use Illuminate\Database\Eloquent\Model;
use LogicException;

class SettingsAudit extends Model
{
    protected $table = 'golvia_membership_settings_audits';

    protected $guarded = ['id'];

    protected $casts = [
        'old_values' => 'array',
        'new_values' => 'array',
        'effective_at' => 'datetime',
    ];

    protected static function booted(): void
    {
        static::updating(fn () => throw new LogicException('Settings audits are append-only.'));
        static::deleting(fn () => throw new LogicException('Settings audits are append-only.'));
    }
}
