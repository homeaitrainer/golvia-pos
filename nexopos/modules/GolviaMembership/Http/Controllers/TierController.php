<?php

namespace Modules\GolviaMembership\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\GolviaMembership\Http\Requests\UpdateTierRequest;
use Modules\GolviaMembership\Models\MembershipRuleVersion;
use Modules\GolviaMembership\Services\MembershipSettingsService;
use Modules\GolviaMembership\Services\TierManagementService;

class TierController extends Controller
{
    public function __construct(
        private readonly TierManagementService $tiers,
        private readonly MembershipSettingsService $settings,
    ) {
    }

    public function update(UpdateTierRequest $request): JsonResponse
    {
        $version = $this->tiers->createDraft($request->validated('tiers'), (int) $request->user()->id);

        return response()->json(['data' => $this->settings->serialize($version)], 201);
    }

    public function activate(MembershipRuleVersion $version): JsonResponse
    {
        return response()->json(['data' => $this->settings->serialize($this->tiers->activate($version))]);
    }

    public function recalculate(Request $request, MembershipRuleVersion $version): JsonResponse
    {
        $validated = $request->validate(['chunk_size' => ['sometimes', 'integer', 'min:1', 'max:500']]);
        $result = $this->tiers->recalculateChunk($version, (int) ($validated['chunk_size'] ?? 100));

        return response()->json(['data' => $this->settings->serialize($result)]);
    }
}
