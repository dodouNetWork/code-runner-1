process.on('message', async ({name, data}) => {
    switch (name) {
        case 'RUN_CODE':
            let result = await (async () => {DYNAMIC_CODE})()
            console.log({data, result})
            process.send({
                name: 'RUN_CODE_RESULT',
                data: {
                    success: true,
                    innerRequestId: data.innerRequestId,
                    userRequestId: data.userRequestId,
                    result
                }
            })
            break
        default:
            console.log('hehe')
            break
    }
})

setInterval(() => {
    process.send({
        name: 'HEARTBEAT',
        data: {
            cpuUsage: {},
            memoryUsage: {}
        }
    })
    console.log('heartbeat send')
}, 1000)
