#!/usr/bin/env sh
# Removes one-off debug/fix/patch scripts that tend to pile up in the repo root.
# Runs automatically from the pre-commit git hook (see .git/hooks/pre-commit),
# and can also be run by hand: sh scripts/clean-scratch-files.sh

set -e

cd "$(git rev-parse --show-toplevel)"

# Naming conventions that are always scratch files, including ones added later.
GLOB_JUNK="fix.js fix2.js fix3.js fix4.js fix5.js fix6.js fix_*.js fix_*.py fix.ps1 patch_*.js"

# Specific one-off scripts identified during cleanup. Listed by name (not by a
# generic prefix glob like add_*/check_*) so a future legitimately-named file
# can't be swept up by accident.
NAMED_JUNK="add_cert.js add_comment_test.js add_routes.js append_admin.js check_drop.js check_formdata.js final_fix.js gen_tests.js get_vite_error.js rename_reqspace.js restore.js restore_client.ps1"

# Stray log files that sometimes land at repo root (already gitignored).
LOG_JUNK="*.log"

removed=""
for pattern in $GLOB_JUNK $NAMED_JUNK $LOG_JUNK; do
  for f in $pattern; do
    [ -e "$f" ] || continue
    if git ls-files --error-unmatch -- "$f" >/dev/null 2>&1; then
      git rm -q -f -- "$f"
    else
      rm -f -- "$f"
    fi
    removed="$removed $f"
  done
done

if [ -n "$removed" ]; then
  echo "clean-scratch-files: removed$removed"
fi
