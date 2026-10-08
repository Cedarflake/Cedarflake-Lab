# Dependency security patches

## braces 3.0.3

`braces@3.0.3.patch` is a local mitigation for
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), following
the parser-depth mitigation described in [upstream issue #70](https://github.com/micromatch/braces/issues/70).
It is not an upstream release or backport. At the time of this change, the
advisory names 3.0.4 as fixed, but that version is unavailable from npm.

The parser rejects more than 100 combined brace/parenthesis nesting levels.
The compile, expand, and stringify walkers enforce the same bound for callers
that provide an AST directly. Escaped, quoted, and bracketed delimiters remain
literal. Normal inputs, existing length/range limits, and ordinary glob behavior
are preserved; deeply nested valid patterns now throw a controlled `SyntaxError`.
Callers must still handle invalid-input errors. This does not change unrelated
expansion-size behavior.

Run `pnpm check:dependency-security` against the actual installed dependency.
Shika's `check` includes this guard because its ESLint dependency tree owns the
patched package. The guard covers the depth boundary, malformed/mixed nesting,
direct and cyclic AST input, literal delimiters, and ordinary expansion behavior.
It fails if the patch is lost. The optional second package-directory argument
runs seeded differential tests against an unpatched 3.0.3 copy.

The raw package audit still reports this advisory because the installed version
remains 3.0.3. No audit waiver is configured. Browser workflows run their audit
last so functional verification can complete while the audit remains a failing
gate. Replace the local patch with a verified compatible upstream release once
available, rerun the regression and owning checks, then remove this patch entry.

## brace-expansion 5.0.12

`brace-expansion@5.0.12.patch` preserves the existing CommonJS/default-export
compatibility shim used by minimatch 3 and 9 while updating the upstream package
to its security-fixed release. It does not alter the package's expansion logic.
