"""Create build02 source without changing the locked build01 inputs or evidence."""
from pathlib import Path
R=Path(__file__).resolve().parents[3];source=Path(__file__).resolve().parent;out=source/'probe-v0311'
assert not out.exists();out.mkdir()
def write(name,value):
    with (out/name).open('x',encoding='utf-8',newline='\n') as f:f.write(value)
def replace(value,before,after):
    assert value.count(before)==1,(before,value.count(before));return value.replace(before,after,1)
c=(source/'PrivateAssignmentController03C.cs').read_text()
c=replace(c,'internal bool AssignmentAttempted { get { return attempted; } }','''internal bool AssignmentAttempted { get { return attempted; } }
        // Called by the API after all final native context checks. Clock is checked last.
        internal bool NativeAssignmentAllowed { get { return attempted && Active && !stopping && !Finished && BaselineAccepted && guard.Ready && journal.Healthy && clock() < assignmentCutoff; } }''')
write('PrivateAssignmentController03C.cs',c)
a=(source/'PrivateProfile03C.Shvdne.cs').read_text()
a=replace(a,'new ShvdneProfileApi(delegate { return journal.Ready; });','new ShvdneProfileApi(delegate { return journal.Ready; }, delegate { return controller != null && controller.NativeAssignmentAllowed; });')
a=replace(a,'readonly Func<bool> admitted;','readonly Func<bool> admitted, assignmentAllowed;')
a=replace(a,'internal ShvdneProfileApi(Func<bool> admitted) { if (admitted == null) throw new ArgumentNullException("admitted"); this.admitted = admitted; }','internal ShvdneProfileApi(Func<bool> admitted, Func<bool> assignmentAllowed) { if (admitted == null || assignmentAllowed == null) throw new ArgumentNullException("admission/assignment guard"); this.admitted = admitted; this.assignmentAllowed = assignmentAllowed; }')
a=replace(a,'!EmptyStoppedAndDriveable(item) || !admitted()) throw new InvalidOperationException("assignment final identity/context/supervision refused");','!EmptyStoppedAndDriveable(item) || !admitted() || !assignmentAllowed()) throw new InvalidOperationException("assignment final identity/context/supervision/phase refused");')
write('PrivateProfile03C.Shvdne.cs',a)
for name in ['PrivateResourceAdmission03C.cs','PrivateCandidateBinding03C.cs']:
    write(name,(source/name).read_text())
write('AssemblyInfo03C.cs',(source/'AssemblyInfo03C.cs').read_text().replace('0.3.1.0','0.3.1.1'))
print('Prepared separate03C v0.3.1.1 final API phase-guard source; build01 untouched')
