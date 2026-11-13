"""Retained metadata/admission cases with the corrected03I coordinator."""
from pathlib import Path
R=Path(__file__).resolve().parents[1];source=R/'tests/Test-PrivateRecovery03H.py'
text=source.read_text().replace('private-profile03h','private-profile03i').replace('PRIVATE-03H','PRIVATE-03I').replace('Private03H','Private03I').replace('03H roots','03I roots')
exec(compile(text,str(source)+' [03I coordinator]','exec'),dict(__file__=str(source),__name__='__main__'))
