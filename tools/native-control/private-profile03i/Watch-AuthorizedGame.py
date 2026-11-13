"""Unchanged one-attachment policy with explicitly replaced metadata transport."""
from Shared import ROOT,Context
from MetadataQuery import query
Context.require()
original=Context.load('retained03f_watch_h',ROOT/'tools/native-control/private-profile03f/Watch-AuthorizedGame.py')
# Ordinary Python adapter substitution. No executable/game hook or patch.
original.watcher.query=query
def main(digest):return original.main(digest)
