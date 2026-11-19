# Precision-first benchmark — threshold 0.48 (final: report sets included)


## Sub-areas kept (default)

| dataset | role | engine | wrong (n) | P auto | R auto | R auto+sugg | P sugg | x-intent pairs | merged | avg merged group | suggestions | x-theme | >7 | lost/dup | ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A-1200 | tuning | A | 1.4% (17) | 0.960 | 0.559 | — | — | 26 | 74.1% | 3.72 | — | 0 | 0 | 0/0 | 55 |
| A-1200 | tuning | H | 1.0% (12) | 0.969 | 0.582 | — | — | 14 | 74.6% | 3.82 | — | 0 | 0 | 0/0 | 50 |
| A-1200 | tuning | P | 0.0% (0) | 1.000 | 0.509 | 0.760 | 0.965 | 0 | 71.2% | 3.54 | 251 | 0 | 0 | 0/0 | 97 |
| B-dev | tuning | A | 2.4% (9) | 0.820 | 0.140 | — | — | 1 | 24.7% | 3.00 | — | 0 | 0 | 0/0 | 15 |
| B-dev | tuning | H | 2.4% (9) | 0.844 | 0.165 | — | — | 2 | 30.9% | 2.90 | — | 0 | 0 | 0/0 | 16 |
| B-dev | tuning | P | 0.0% (0) | 1.000 | 0.076 | 0.287 | 0.820 | 0 | 19.1% | 2.32 | 88 | 0 | 0 | 0/0 | 19 |
| Fresh-403 | tuning | A | 0.5% (2) | 0.958 | 0.152 | — | — | 4 | 26.3% | 2.47 | — | 0 | 0 | 0/0 | 11 |
| Fresh-403 | tuning | H | 0.5% (2) | 0.962 | 0.167 | — | — | 4 | 28.3% | 2.48 | — | 0 | 0 | 0/0 | 13 |
| Fresh-403 | tuning | P | 0.0% (0) | 1.000 | 0.119 | 0.359 | 0.986 | 0 | 25.6% | 2.24 | 75 | 0 | 0 | 0/0 | 16 |
| B-heldout | report | A | 0.6% (1) | 0.978 | 0.138 | — | — | 1 | 23.3% | 2.71 | — | 0 | 0 | 0/0 | 5 |
| B-heldout | report | H | 0.6% (1) | 0.981 | 0.167 | — | — | 1 | 25.2% | 2.93 | — | 0 | 0 | 0/0 | 5 |
| B-heldout | report | P | 0.0% (0) | 1.000 | 0.123 | 0.277 | 0.817 | 0 | 16.0% | 3.25 | 26 | 0 | 0 | 0/0 | 7 |
| New-460 | report (frozen; errors inspected after round 1) | A | 1.5% (7) | 0.922 | 0.140 | — | — | 7 | 36.7% | 2.32 | — | 0 | 0 | 0/0 | 15 |
| New-460 | report (frozen; errors inspected after round 1) | H | 1.5% (7) | 0.941 | 0.149 | — | — | 5 | 38.7% | 2.34 | — | 0 | 0 | 0/0 | 15 |
| New-460 | report (frozen; errors inspected after round 1) | P | 0.0% (0) | 1.000 | 0.142 | 0.371 | 0.946 | 0 | 33.9% | 2.33 | 103 | 0 | 0 | 0/0 | 19 |
| New2-499 | report (frozen 25 Oct, never inspected) | A | 1.6% (8) | 0.918 | 0.254 | — | — | 13 | 45.9% | 2.60 | — | 0 | 0 | 0/0 | 14 |
| New2-499 | report (frozen 25 Oct, never inspected) | H | 1.6% (8) | 0.923 | 0.284 | — | — | 14 | 47.5% | 2.72 | — | 0 | 0 | 0/0 | 16 |
| New2-499 | report (frozen 25 Oct, never inspected) | P | 0.2% (1) | 0.995 | 0.219 | 0.490 | 0.964 | 1 | 40.3% | 2.51 | 120 | 0 | 0 | 0/0 | 19 |

## Sub-areas mixed

| dataset | role | engine | wrong (n) | P auto | R auto | R auto+sugg | P sugg | x-intent pairs | merged | avg merged group | suggestions | x-theme | >7 | lost/dup | ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A-1200 | tuning | A | 1.7% (20) | 0.958 | 0.673 | — | — | 15 | 84.5% | 3.90 | — | 0 | 0 | 0/0 | 70 |
| A-1200 | tuning | H | 1.8% (22) | 0.955 | 0.700 | — | — | 15 | 85.3% | 4.03 | — | 0 | 0 | 0/0 | 72 |
| A-1200 | tuning | P | 0.0% (0) | 1.000 | 0.615 | 0.756 | 0.926 | 0 | 81.3% | 3.71 | 108 | 0 | 0 | 0/0 | 100 |
| B-dev | tuning | A | 5.9% (22) | 0.746 | 0.141 | — | — | 1 | 30.6% | 2.88 | — | 0 | 0 | 0/0 | 17 |
| B-dev | tuning | H | 5.1% (19) | 0.780 | 0.170 | — | — | 2 | 36.4% | 2.85 | — | 0 | 0 | 0/0 | 19 |
| B-dev | tuning | P | 0.0% (0) | 1.000 | 0.088 | 0.287 | 0.811 | 0 | 20.2% | 2.38 | 82 | 0 | 0 | 0/0 | 22 |
| Fresh-403 | tuning | A | 1.0% (4) | 0.908 | 0.197 | — | — | 6 | 32.3% | 2.55 | — | 0 | 0 | 0/0 | 18 |
| Fresh-403 | tuning | H | 1.0% (4) | 0.918 | 0.221 | — | — | 6 | 33.7% | 2.62 | — | 0 | 0 | 0/0 | 18 |
| Fresh-403 | tuning | P | 0.0% (0) | 1.000 | 0.142 | 0.359 | 0.985 | 0 | 29.3% | 2.27 | 65 | 0 | 0 | 0/0 | 17 |
| B-heldout | report | A | 2.5% (4) | 0.927 | 0.160 | — | — | 1 | 26.4% | 2.87 | — | 0 | 0 | 0/0 | 6 |
| B-heldout | report | H | 1.2% (2) | 0.967 | 0.186 | — | — | 1 | 26.4% | 3.07 | — | 0 | 0 | 0/0 | 6 |
| B-heldout | report | P | 0.0% (0) | 1.000 | 0.126 | 0.305 | 0.864 | 0 | 17.2% | 3.11 | 25 | 0 | 0 | 0/0 | 8 |
| New-460 | report (frozen; errors inspected after round 1) | A | 2.4% (11) | 0.894 | 0.189 | — | — | 11 | 48.7% | 2.33 | — | 0 | 0 | 0/0 | 21 |
| New-460 | report (frozen; errors inspected after round 1) | H | 2.0% (9) | 0.944 | 0.218 | — | — | 3 | 50.2% | 2.41 | — | 0 | 0 | 0/0 | 22 |
| New-460 | report (frozen; errors inspected after round 1) | P | 0.0% (0) | 1.000 | 0.204 | 0.371 | 0.928 | 0 | 43.7% | 2.39 | 74 | 0 | 0 | 0/0 | 21 |
| New2-499 | report (frozen 25 Oct, never inspected) | A | 2.6% (13) | 0.921 | 0.343 | — | — | 10 | 60.7% | 2.68 | — | 0 | 0 | 0/0 | 20 |
| New2-499 | report (frozen 25 Oct, never inspected) | H | 3.2% (16) | 0.906 | 0.381 | — | — | 20 | 61.5% | 2.84 | — | 0 | 0 | 0/0 | 22 |
| New2-499 | report (frozen 25 Oct, never inspected) | P | 0.2% (1) | 0.996 | 0.266 | 0.472 | 0.929 | 1 | 49.7% | 2.56 | 81 | 0 | 0 | 0/0 | 21 |

## Runtime at 1,500 questions (median of 5)

| engine | buildClusters (kept) | buildClusters (mixed) | suggestMerges (kept) |
|---|---|---|---|
| A | 56 ms | 110 ms | — |
| H | 59 ms | 111 ms | — |
| P | 92 ms | 131 ms | 75 ms |

## Invariants (new engine P)

| dataset | order-independent (kept/mixed) | re-merge stable (kept/mixed) | locked groups kept | answers copied | lost/dup/x-theme/>7 after re-merge |
|---|---|---|---|---|---|
| A-1200 | true/true | true/true | true | false | 0/0/0/0 |
| B-dev | true/true | true/true | true | false | 0/0/0/0 |
| Fresh-403 | true/true | true/true | true | false | 0/0/0/0 |
| B-heldout | true/true | true/true | true | false | 0/0/0/0 |
| New-460 | true/true | true/true | true | false | 0/0/0/0 |
| New2-499 | true/true | true/true | true | false | 0/0/0/0 |
