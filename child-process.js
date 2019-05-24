const child_process = require('child_process')
const assert = require('assert')
const hash = require('./common/hash')
const fs = require('fs')
const path = require('path')

module.exports = class ChildProcess {
    constructor({
        scriptPath,
        onLog,
        onErr,
        onCodeResult
    }) {
        assert.ok(scriptPath, 'child-process filePath required.')
        this.lastActiveTime = Date.now()
        this.lastHeartBeatTime = Date.now()
        this.cpuUsage = {}
        this.memoryUsage = {}
        this.ready = false
        this.free = true
        this.child_process = null
        this.scriptPath = scriptPath
        this.onLog = onLog || (() => {})
        this.onErr = onErr || (() => {})
        this.onCodeResult = onCodeResult
    }
    // 执行代码，其实是向子进程发送消息
    runCode({
        code,
        innerRequestId,
        userRequestId,
        data
    }) {
        assert.ok(code, 'code required')
        let codeId = hash(code)
        if (!this.child_process) {
            let realDir = path.dirname(this.scriptPath)
            let scriptName = path.basename(this.scriptPath)
            let fileName = `${codeId}.${scriptName}`
            let realFilePath = path.join(realDir, fileName)
            if (!fs.existsSync(realFilePath)) {
                let scriptContent = fs.readFileSync(this.scriptPath).toString().replace('DYNAMIC_CODE', code)
                fs.writeFileSync(realFilePath, scriptContent)
                console.log('写入路径：', realFilePath)
            }
            this.child_process = child_process.fork(realFilePath, [], {
                stdio: 'pipe'
            })
            // 接收来自子进程的stdout/stderr/onCodeResult
            this.child_process.stdout.on('data', buf => {
                this.onLog(buf.toString())
            })
            this.child_process.stderr.on('data', buf => {
                this.onErr(buf.toString())
            })
            this.child_process.on('message', ({
                name,
                data
            }) => {
                switch (name) {
                    // 代码执行结束消息
                    case 'RUN_CODE_RESULT':
                        this.onCodeResult(data)
                        break
                        // 心跳消息
                    case 'HEARTBEAT':
                        this.cpuUsage = data.cpuUsage
                        this.memoryUsage = data.memoryUsage
                        this.lastHeartBeatTime = Date.now()
                        // 有心跳表明ready
                        this.ready = true
                        break
                    default:
                        this.onLog({
                            name,
                            data
                        })
                        break
                }
            })
        }
        this.free = false
        if (!this.codeId) {
            this.codeId = codeId
        }
        this.child_process.send({
            name: 'RUN_CODE',
            data: {
                innerRequestId,
                userRequestId,
                code,
                context: data
            }
        })
        this.lastActiveTime = Date.now()
    }

    reset() {
        let realDir = path.dirname(this.scriptPath)
        let scriptName = path.basename(this.scriptPath)
        let fileName = `${this.codeId}.${scriptName}`
        let realFilePath = path.join(realDir, fileName)
        try {
            fs.unlinkSync(realFilePath)
            console.log(`delete file success: "${realFilePath}"`)
        } catch (e) {
            console.log(`delete file failed: "${realFilePath}"`)
        }
        this.codeId = undefined
        this.free = true
        if (this.child_process) {
            console.log('process freed: ' + this.child_process.pid)
            this.child_process.kill('SIGINT')
        }
        this.child_process = undefined
        this.ready = false
        this.cpuUsage = {}
        this.memoryUsage = {}
    }
}