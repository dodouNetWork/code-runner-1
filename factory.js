const assert = require('assert')
const uuid = require('uuid/v4')
const ProcessManager = require('./process-manager')

class CodeFactory {
    constructor({
        onLog,
        onErr,
        onHealthStatus,
        // 注意了，scriptPath对应的脚本里面一定要有
        // 1. 发送"HEARTBEAT"和"RUN_CODE_RESULT"消息给父进程
        // 2. 处理来自父进程的name="RUN_CODE"的消息
        // 3. DYNAMIC_CODE
        scriptPath,
        processCount,
        maxProcessCount,
        maxIdleTime,
        maxTimeout,
        beforeRunCode,
        afterRunCode
    }) {
        this.maxTimeout = (maxTimeout || 60) * 1000
        assert.ok(!isNaN(this.maxTimeout), 'maxTimeout must be a number')
        this.callbacks = {}
        this.codeId2ReqIdsMap = {}
        this.beforeRunCode = beforeRunCode
        this.afterRunCode = afterRunCode
        this.pm = new ProcessManager({
            scriptPath,
            processCount,
            maxProcessCount,
            maxIdleTime,
            onLog,
            onErr,
            onHealthStatus,
            onCodeResult: ({
                innerRequestId,
                userRequestId,
                err,
                success,
                result
            }) => {
                process.nextTick(() => {
                    let callback = this._popCallback(innerRequestId)
                    if (callback) {
                        if (this.afterRunCode && typeof this.afterRunCode === 'function') {
                            result = this.afterRunCode(result)
                        }
                        callback[(success && !err) ? 'resolve' : 'reject']({
                            userRequestId,
                            err,
                            success,
                            result
                        })
                    }
                })
            }
        })
        setInterval(() => {
            this._cleanTimeoutCallbacks()
        }, 1000)
    }

    runCode(params) {
        let p
        if (this.beforeRunCode && typeof this.beforeRunCode === 'function') {
            p = this.beforeRunCode(params)
        } else {
            p = params
        }
        p.timeout = isNaN(p.timeout) ? this.maxTimeout : p.timeout
        p.timeout = Math.min(p.timeout, 2 * 60 * 1000) // 保护系统，超过两分钟不处理的promise全部丢掉
        let innerRequestId = uuid()
        let userRequestId = p.requestId || innerRequestId
        this.pm.runCode({
            code: p.code,
            innerRequestId,
            userRequestId,
            data: p.data
        })
        let cbObj = {
            timeout: Date.now() + p.timeout,
            userRequestId
        }
        let promise = new Promise((resolve, reject) => {
            cbObj.resolve = resolve
            cbObj.reject = reject
        })
        this.callbacks[innerRequestId] = cbObj
        return promise
    }

    _popCallback(innerRequestId) {
        if (innerRequestId in this.callbacks) {
            let callback = this.callbacks[innerRequestId]
            delete this.callbacks[innerRequestId]
            return callback
        }
    }

    _cleanTimeoutCallbacks() {
        let now = Date.now()
        for (let innerRequestId in this.callbacks) {
            let cbObj = this.callbacks[innerRequestId]
            if (now > cbObj.timeout) {
                cbObj.reject({
                    innerRequestId,
                    userRequestId: cbObj.userRequestId,
                    err: new Error('REQUEST_TIMEOUT'),
                    success: false
                })
                delete this.callbacks[innerRequestId]
            }
        }
    }
}

module.exports = CodeFactory
