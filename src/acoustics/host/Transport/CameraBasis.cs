using System;
namespace RichAudio.Beacon.Transport
{
    // Research conversion only: GTA camera rotation order 2 (ZXY) to a Z-up basis.
    // Numerical orthogonality is tested offline; native camera interpretation still needs live validation.
    public static class CameraBasis
    {
        public static void FromZxyDegrees(double pitch,double roll,double yaw,out double[] forward,out double[] up)
        {
            Protocol.Check(Protocol.Finite(pitch)&&Protocol.Finite(roll)&&Protocol.Finite(yaw),"finite camera rotation");
            double p=pitch*Math.PI/180,r=roll*Math.PI/180,y=yaw*Math.PI/180;
            double sp=Math.Sin(p),cp=Math.Cos(p),sr=Math.Sin(r),cr=Math.Cos(r),sy=Math.Sin(y),cy=Math.Cos(y);
            forward=new[]{-sy*cp,cy*cp,sp};
            up=new[]{cy*sr+sy*sp*cr,sy*sr-cy*sp*cr,cp*cr};
        }
    }
}
