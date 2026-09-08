<?php

namespace Modules\GolviaMembership\Settings;

use App\Services\SettingsPage;

class MembershipSettings extends SettingsPage
{
    public const AUTOLOAD = false;

    public const IDENTIFIER = 'golvia-membership';

    protected $form = [
        'title' => 'GOLVIA Membership Settings',
        'description' => 'Configure effective-dated coin earning and redemption rules.',
        'tabs' => [],
    ];
}
