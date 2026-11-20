<?php
declare(strict_types=1);

$root = dirname(__DIR__);
$required = [
    $root . '/index.php' => ['CREATE TABLE IF NOT EXISTS project_members', 'CREATE TABLE IF NOT EXISTS project_links', 'validGitPath', 'gitServiceRequest', 'GIT_SERVICE_URL', 'githubInfo', 'projectLink', 'update-location', "a==='notifications", "a==='delete-task", "a==='project-link", "a==='remove-project-link", 'due_date', 'priority', 'requireCsrf', 'session_regenerate_id'],
    $root . '/assets/app.js' => ['shareProject', 'refreshNotifications', 'github-info', 'editLocation', 'edit-location', 'remove-location', 'detailModal', 'git-tree', 'newTaskPriority', 'mobile-nav', 'notification-panel', 'renderTaskCenter', 'editTask', 'deleteTask', 'faviconMarkup', 'addProjectLink', 'removeProjectLink', 'X-CSRF-Token'],
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
