<?php
declare(strict_types=1);

$root = dirname(__DIR__);
$required = [
    $root . '/index.php' => ['CREATE TABLE IF NOT EXISTS project_members', 'validGitPath', 'githubInfo', 'update-location', "a==='notifications"],
    $root . '/assets/app.js' => ['shareProject', 'refreshNotifications', 'github-info', 'editLocation', 'edit-location', 'remove-location', 'detailModal', 'git-tree'],
];
$failed = [];
foreach ($required as $file => $needles) {
    $contents = file_get_contents($file);
    foreach ($needles as $needle) {
        if (strpos($contents, $needle) === false) $failed[] = basename($file) . ': manca ' . $needle;
    }
}
$lint = shell_exec('php -l ' . escapeshellarg($root . '/index.php') . ' 2>&1');
if (!str_contains((string)$lint, 'No syntax errors detected')) $failed[] = 'index.php non supera php -l';
if ($failed) { fwrite(STDERR, implode(PHP_EOL, $failed) . PHP_EOL); exit(1); }
echo "Project Hub smoke check: OK\n";
