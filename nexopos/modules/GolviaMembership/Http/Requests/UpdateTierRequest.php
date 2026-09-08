<?php

namespace Modules\GolviaMembership\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class UpdateTierRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'tiers' => ['required', 'array', 'min:1'],
            'tiers.*.key' => ['required', 'string', 'max:40', 'regex:/^[a-z0-9][a-z0-9_-]*$/', 'distinct'],
            'tiers.*.name' => ['required', 'string', 'max:80'],
            'tiers.*.minimum_lifetime_coins' => ['required', 'integer', 'min:0', 'max:9223372036854775807'],
            'tiers.*.maximum_lifetime_coins' => ['present', 'nullable', 'integer', 'min:0', 'max:9223372036854775806'],
            'tiers.*.discount_percent' => ['required', 'string', 'regex:/^\d{1,3}(?:\.\d{1,2})?$/'],
        ];
    }

    public function after(): array
    {
        return [function (Validator $validator): void {
            $tiers = $this->input('tiers');
            if (! is_array($tiers) || $validator->errors()->isNotEmpty()) {
                return;
            }

            $sorted = collect($tiers)->sortBy('minimum_lifetime_coins')->values();
            if ((int) $sorted->first()['minimum_lifetime_coins'] !== 0) {
                $validator->errors()->add('tiers', 'Tier coverage must begin at zero.');
            }
            if ($sorted->whereNull('maximum_lifetime_coins')->count() !== 1 || $sorted->last()['maximum_lifetime_coins'] !== null) {
                $validator->errors()->add('tiers', 'Exactly the final tier must be open-ended.');
            }

            foreach ($sorted as $index => $tier) {
                $minimum = (int) $tier['minimum_lifetime_coins'];
                $maximum = $tier['maximum_lifetime_coins'] === null ? null : (int) $tier['maximum_lifetime_coins'];
                if ($maximum !== null && $maximum < $minimum) {
                    $validator->errors()->add("tiers.{$index}.maximum_lifetime_coins", 'Maximum must not be below minimum.');
                }
                if ($this->percentBasisPoints((string) $tier['discount_percent']) > 10000) {
                    $validator->errors()->add("tiers.{$index}.discount_percent", 'Discount may not exceed 100%.');
                }
                if ($index > 0) {
                    $previousMaximum = $sorted[$index - 1]['maximum_lifetime_coins'];
                    if ($previousMaximum === null || $minimum !== (int) $previousMaximum + 1) {
                        $validator->errors()->add('tiers', 'Tier ranges must be contiguous and non-overlapping.');
                    }
                }
            }
        }];
    }

    private function percentBasisPoints(string $percent): int
    {
        [$whole, $fraction] = array_pad(explode('.', $percent, 2), 2, '');

        return ((int) $whole * 100) + (int) str_pad($fraction, 2, '0');
    }
}
