<?php

namespace Modules\GolviaMembership\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateMembershipSettingsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'enabled' => ['required', 'boolean'],
            'earning_spend_amount' => ['required', 'string', 'regex:/^(?!0+(?:\.0{1,2})?$)\d{1,10}(?:\.\d{1,2})?$/'],
            'coins_earned' => ['required', 'integer', 'min:1', 'max:9223372036854775807'],
            'redemption_coins' => ['required', 'integer', 'min:1', 'max:9223372036854775807'],
            'redemption_value' => ['required', 'string', 'regex:/^(?!0+(?:\.0{1,2})?$)\d{1,10}(?:\.\d{1,2})?$/'],
        ];
    }
}
