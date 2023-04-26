/*
 *BS的Wedo程序使用TCP时输出的并非ModbusTCP帧而是ModbusRTU帧，该程序就是把ModbusRTU帧转为ModbusTCP帧，
 *然后连接第三方的ModbusTCP服务器获取他们的ModbusTCP服务器数据
 *server(tcpClient)为本程序创建的TCP Server(127.0.0.1：4000)，由Wedo程序连接
 *client(tcpServer)为本程序创建的TCP Client(127.0.0.1:xxxxx)，主动握手第三方ModbusTCP服务器
 *事务流程：
 *server接收Wedo的请求帧，由client发给第三方ModbusTCP服务器，
 *client接收第三方ModbusTCP服务器的数据帧，由server返回Wedo，
*/

// calculate the 16-bit CRC of data with predetermined length.
var CRC = {};
CRC.ToModbusCRC16 = function (data){
    const crctab16 = new Uint16Array([0x0000, 0xCC01, 0xD801, 0x1400, 0xF001, 0x3C00, 0x2800, 0xE401, 0xA001, 0x6C00, 0x7800, 0xB401, 0x5000, 0x9C01, 0x8801, 0x4400,]);
    var res = 0xffff;
    for (let b of data) {
        res = crctab16[(b ^ res) & 15] ^ (res >> 4);
        res = crctab16[((b >> 4) ^ res) & 15] ^ (res >> 4);
    }
    return (res) & 0xffff;
}

//TCP服务器---被上位机连接---------------------------------------------------------
var sHOST = '127.0.0.1';    //本程序服务器IP
var sPORT = 4000;           //本程序服务器端口号
var tcpClient = null;       //本程序服务器socket
var remoteAddress;          //本程序服务器socket
var remotePort;             //本程序服务器socket

var MBAP = 65530;           //ModbusTCP MBAP
var UNIT = 0;               //ModbusTCP UNIT

var server = net = require('net').createServer((socket)=>{                                      //创建Server
    tcpClient = socket;                                                                         //绑定socket
    var addr = socket.address().address + ':' + socket.address().port;                          //获取socket信息
    console.log('上位机接入:', tcpClient.remoteAddress, tcpClient.remotePort);                   //打印socket的上位机信息
    remoteAddress = tcpClient.remoteAddress;
    remotePort = tcpClient.remotePort;
    socket.on('data', data=>{                                                               //收到上位机发过来数据
        if(tcpServer&& (data.length >=6 )){                                                     //如果控制器通讯正常，数据长度正常，则把上位机的帧处理后发送到控制器
            var crc = CRC.ToModbusCRC16(data);                                                  //CRC校验处理
            if(crc == 0){                                                                       //数据CRC校验通过
                var hand = Buffer.from([(MBAP>>8), (MBAP&0xff), 0, 0, UNIT, data.length - 2]);  //ModbusTCP MBAP 头部
                var arr = Buffer.concat([hand, data], hand.length + data.length - 2);           //追加MBAP头部的数组 并 去掉 ModbusRTU的CRC码
                MBAP += 1;                                                                      //MBAP 自增1
                if(MBAP > 65535) { MBAP = 0; }                                                  //MBAP 最大65535
                tcpServer.write(arr);                                                           //把新数组发出去
            }
        }
    })
    socket.on('close',()=>{                                                                     //上位机客户端关闭
        console.log('上位机关闭:', remoteAddress, remotePort);                                   //打印socket的上位机信息
        tcpClient = null;                                                                       //释放socket
    })
    socket.on('error',(err)=>{                                                                  //上位机客户端错误
        console.log('上位机错误:', remoteAddress, remotePort, err);                              //
        tcpClient = null;                                                                       //
    })
})
server.on('error',(err)=>{                                                                      //本服务器异常错误
    console.log('服务器出错了:', err);                                                           //打印服务器错误信息
    tcpClient = null;                                                                           //
})
server.listen({port: sPORT, host: sHOST}, () => {                                               //侦听上位机客户端连接
    console.log('服务器启动:', sHOST + ':' + sPORT);                                             //打印服务器信息
})

//TCP客户端---连接控制器---------------------------------------------------------
var cHOST = '127.0.0.1';    //下位机ModbusTCP服务器IP
var cPORT = 502;            //下位机ModbusTCP服务器端口号
var tcpServer = null;;      //下位机ModbusTCP服务器socket

var quitting = false;
var retryTimeout = 3000;
var retriedTimes = 0;
var maxRetrieds = 10;

(function connect() {                                                       //创建连接自动从新连接函数
	function reconnect() {                                                  //创建出错自动连接函数
		if(retriedTimes > maxRetrieds){                                     //重试次数判断
			throw new Error('超过重试次数');                                 //
		} else {
			retriedTimes = 0;                                               //直接置0表示无限次重试次数
			setTimeout(connect, retryTimeout);                              //3秒重试一次
		}
	}
	tcpServer = require('net').createConnection(cPORT);                     //创建连接
	tcpServer.on('connect', function () {                                   //连接下位机正常
		retriedTimes = 0;                                                   //置0表示正常连接了
		console.log('控制器接入:', cHOST + ':' + cPORT);                     //打印下位机信息
	});
	tcpServer.on('data', function(data){                                //接收到下位机返回的数据
        if(tcpClient && (data.length >= 3)){                                //如果上位机通讯正常,则把控制器返回来的数据处理后返回上位机
            var buf = data.subarray(6, data.length);                        //去掉ModbusTCP的MBAP后，再计算CRC到最后返回上位机ModbusRTU帧
            var crc = CRC.ToModbusCRC16(buf);                               //计算处理后的数据帧 并合并 后发回给上位机
            var bufc = Buffer.from([(crc&0xFF), (crc>>8)]);                 //
            var arr = Buffer.concat([buf, bufc], buf.length + bufc.length); //
            tcpClient.write(arr);                                           //把处理后的数据发出去
        }
	});
	tcpServer.on('error', function (err) {                                  //下位机错误
		console.log('控制器错误:', err.message);                             //打印错误信息
        tcpServer = null;                                                   //
	});
	tcpServer.on('close', function () {                                     //下位机关闭，重连
		if(!quitting){
			console.log('尝试连接控制器', cHOST + ':' + cPORT);              //
            tcpServer = null;
			reconnect();                                                    //重连
		} else {
			console.log('客户端退出');                                       //正常退出
            tcpServer = null;
		}
	})
} () );
