# BENCHMARK-01: My RPH native invocation correction

I've corrected one invocation convention offline, on top of PR #40 (`dcac887a64bc0c3de64f7173a3d44a5f490ab276`). Combined progress remains **60%**. No game launch, deployment, new candidate or approval reuse occurred.

My previous attempt retained pre-installation 65535 / 0x0000FFFF, then an installer-block NotSupportedException. Post-installation reads, upgrades, rider and driving were not reached. Cleanup and installation restoration passed. The exact internal throwing layer remains unproven.

## Documented convention and correction

The [official historical generic overload documentation](https://docs.ragepluginhook.net/html/M_Rage_Native_NativeFunction_CallByName__1.htm) specifies int when a native returns no value. Its [explicit-Type overload](https://docs.ragepluginhook.net/html/M_Rage_Native_NativeFunction_CallByName.htm) is the related reference. These are historical 0.56-era documents, not Enhanced runtime certification. They also recommend the Natives facade rather than direct CallByName; I retain the existing adapter interface for this narrow correction, without claiming this historical recommendation has disappeared.

The pinned SDK accepts the generic int overload at compilation. I replaced the explicit typeof(void) call with:

```csharp
NativeFunction.CallByName<int>("SET_VEHICLE_MOD_KIT", Bike(id), selection);
```

The integer is discarded. It is neither a success code nor a kit identity. Selection remains zero and invocation occurs once. Actual getters, positive kit-count requirements, supported indexed count-minus-one selections and matching readbacks remain authoritative. A normal installer return alone cannot pass setup. Missing data, exceptions, unsupported-only setup and mismatches still fail closed before rider creation.

## Diagnostics and related calls

The optional additive `InvocationReturnType` field is System.Int32 for new records. Existing `InstallerReturnType` retains its original meaning, the native's declared System.Void. Older records missing the added field deserialize to null (unavailable), without fabricated historical values. No dummy return integer is persisted. Existing raw getter, count, ownership, attempted-call, normal-return and exception diagnostics are unchanged.

SET_VEHICLE_MOD, TOGGLE_VEHICLE_MOD and TASK_VEHICLE_DRIVE_TO_COORD_LONGRANGE already use generic uint calls. I found no analogous typeof(void) usage there and did not rewrite them. Their individual live behavior remains subject to runtime validation.

## Validation and boundaries

The pinned authentic SDK build passes. Focused tests pass: **132 C# mod-kit assertions**, the existing **191 independent checks plus one additional no-void-call check**, **155 Bati assertions / 715 checks**, and **88 five-stop assertions / 44 checks**. The existing functional-failure, partial-upgrade, exception, no-retry, no-rider and owned-cleanup fixtures remain active. Two added assertions distinguish return types and validate historical diagnostic deserialization. Source checks confirm the discarded generic int invocation and unchanged zero guard. Numerical and synthetic checks do not execute RPH.

Only the installer invocation, additive diagnostic field and focused tests changed. The route, listener, survey, driving, turbo, FINISH, braking, ownership, cleanup, acoustics and audio research remain untouched. Hosted CI and publication status are recorded in the draft PR after exact-commit readback.

This correction follows the documented convention and is technically justified for a future separately approved bounded test. Whether it removes the observed exception, installs a Bati kit, applies indexed upgrades or permits rider-controlled movement remains **unverified**. I have not started that test.
