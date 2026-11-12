"""Create a separately versioned probe source after demonstrated phase-boundary gap.
No resources are rebuilt; no old source or artifact is changed.
"""
from pathlib import Path
import json,hashlib
R=Path(__file__).resolve().parents[3]
old=R/'tools/native-control/private-profile03';out=Path(__file__).resolve().parent
def write(name,value):
    with (out/name).open('x',encoding='utf-8',newline='\n') as f:f.write(value)
def replace(value,before,after):
    assert value.count(before)==1,(before,value.count(before));return value.replace(before,after,1)
controller=(old/'PrivateAssignmentController03.cs').read_text()
controller=replace(controller,'long pending, deadline, modelDeadline, assignmentDeadline;','long pending, deadline, modelDeadline, assignmentDeadline;\n        long activeStarted, baselineCutoff, assignmentCutoff, retirementCutoff;')
controller=replace(controller,'used = true; // A failed intent write also consumes this external one-shot lease.','used = true; // A failed intent write also consumes this external one-shot lease.\n            activeStarted = clock();\n            baselineCutoff = activeStarted + 80 * frequency;\n            assignmentCutoff = activeStarted + 100 * frequency;\n            retirementCutoff = activeStarted + 140 * frequency;')
controller=replace(controller,'deadline = clock() + 3 * 60 * frequency;\n            modelDeadline = clock() + 5 * frequency;','deadline = activeStarted + 3 * 60 * frequency;\n            modelDeadline = activeStarted + 5 * frequency;')
controller=replace(controller,'clock() >= deadline || confirmation != "BASELINES_A_B_MARKER_FREE"','clock() >= baselineCutoff || confirmation != "BASELINES_A_B_MARKER_FREE"')
controller=replace(controller,'clock() >= deadline || confirmation != "ASSIGN_PRIVATE_TO_A"','clock() >= assignmentCutoff || confirmation != "ASSIGN_PRIVATE_TO_A"')
controller=replace(controller,'if (clock() >= deadline) { Stop("3-minute-active-limit"); return; }','''if (clock() >= deadline) { Stop("3-minute-active-limit"); return; }
                if (!BaselineAccepted && clock() >= baselineCutoff) { Stop("baseline-decision-80-second-limit"); return; }
                if (!attempted && clock() >= assignmentCutoff) { Stop("assignment-100-second-limit"); return; }
                if (clock() >= retirementCutoff) { Stop("retirement-140-second-limit"); return; }''')
controller=replace(controller,'if (journal.Persisted(baselineTicket)) { baselinePending = false; BaselineAccepted = true; Record("baseline-gate-accepted; explicit F6/F7 still required"); }','''if (journal.Persisted(baselineTicket)) {
                        if (clock() >= baselineCutoff) { Stop("baseline-decision-80-second-limit"); return; }
                        baselinePending = false; BaselineAccepted = true; Record("baseline-gate-accepted; explicit F6/F7 still required");
                    }''')
controller=replace(controller,'api.AssignPrivateProfile(target);','if (clock() >= assignmentCutoff) { Stop("assignment-100-second-limit"); return; }\n                api.AssignPrivateProfile(target);')
write('PrivateAssignmentController03C.cs',controller)
adapter=(old/'PrivateProfile03.Shvdne.cs').read_text().replace('RA_PRIVATE03','RA_PRIVATE03C').replace('RichAudio.GateAPrivate03.','RichAudio.GateAPrivate03C.').replace('GATE-A-SHVDNE-PRIVATE-03"','GATE-A-SHVDNE-PRIVATE-03C"')
write('PrivateProfile03C.Shvdne.cs',adapter)
write('PrivateResourceAdmission03C.cs',(old/'PrivateResourceAdmission03.cs').read_text())
write('PrivateCandidateBinding03C.cs',(old/'PrivateCandidateBinding03.cs').read_text())
write('AssemblyInfo03C.cs',(old/'AssemblyInfo03.cs').read_text().replace('0.3.0.0','0.3.1.0').replace('PRIVATE-03','PRIVATE-03C'))
print('Prepared separate0.3.1.0 phase-boundary source; resources and oldprobe untouched')
