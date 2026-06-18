// PR check for luna — auto-detected linter on each PR's exact commit; reports a
// GitHub check. Built by multibranch job qa/ci/luna.
// Pinned to ci-pr-checks until jenkins#86 merges; then -> kubit@master.
@Library('kubit@master') _

pipeline {
    agent { label 'test && ARM' }
    options {
        timeout(time: 30, unit: 'MINUTES')
        timestamps()
        ansiColor('xterm')
        buildDiscarder(logRotator(numToKeepStr: '30', daysToKeepStr: '30'))
    }
    stages {
        stage('Check') { steps { repoLint() } }
    }
}
