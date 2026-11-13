"""Run the retained identity, policy and lifecycle cases against the03I code."""
from pathlib import Path
import sys,json
R=Path(__file__).resolve().parents[1]
source=R/'tests/Test-PrivateSupervision03D.py'
text=source.read_text().replace("P=R/'.local/gate-a-shvdne-private-03d'","P=R/'.local/gate-a-shvdne-private-03i'")
text=text.replace("receipt=Build.build(P/('build-'+run))","receipt=json.loads((P/'supervisor/build-06/build.json').read_text())")
old="S/'FailureNotice.cs',S/'SupervisorMonitor03D.cs'"
new="R/'tools/native-control/private-profile03i/FailureNotice03I.cs',R/'tools/native-control/private-profile03i/SupervisorMonitor03I.cs',R/'tools/native-control/private-profile03i/NoticeDelivery.cs'"
assert old in text;text=text.replace(old,new)
exec(compile(text,str(source)+' [03I source and binary]','exec'),dict(__file__=str(source),__name__='__main__'))
