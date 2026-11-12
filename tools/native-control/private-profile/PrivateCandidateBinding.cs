namespace RichAudio.GateA.Private01
{
    // Deliberately sealed closed for this offline delivery. The supplied OpenRPF 0.1
    // has no established exact-build registration/cache contract for 1.0.1158.16.
    // Enabled=true cannot bypass this gate. A newly reviewed candidate must bind
    // its qualified loader, complete shadow and private DLC hashes before activation.
    internal static class PrivateCandidateBinding
    {
        internal static readonly bool Admitted = false;
        internal static readonly ResourcePin[] Pins = new ResourcePin[0];
    }
}
