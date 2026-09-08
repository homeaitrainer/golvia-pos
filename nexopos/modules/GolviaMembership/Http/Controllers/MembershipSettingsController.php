<?php

namespace Modules\GolviaMembership\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Modules\GolviaMembership\Http\Requests\UpdateMembershipSettingsRequest;
use Modules\GolviaMembership\Services\MembershipSettingsService;

class MembershipSettingsController extends Controller
{
    public function __construct(private readonly MembershipSettingsService $settings)
    {
    }

    public function show(): JsonResponse
    {
        return response()->json(['data' => $this->settings->current()]);
    }

    public function update(UpdateMembershipSettingsRequest $request): JsonResponse
    {
        return response()->json([
            'data' => $this->settings->update($request->validated(), (int) $request->user()->id),
        ]);
    }
}
