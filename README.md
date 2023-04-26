# nodejs-tcp-server-client
nodejs tcp server client
BS的Wedo程序使用TCP时输出的并非ModbusTCP帧而是ModbusRTU帧，该程序就是把ModbusRTU帧转为ModbusTCP帧，
然后连接第三方的ModbusTCP服务器获取他们的ModbusTCP服务器数据
server(tcpClient)为本程序创建的TCP Server(127.0.0.1：4000)，由Wedo程序连接
client(tcpServer)为本程序创建的TCP Client(127.0.0.1:xxxxx)，主动握手第三方ModbusTCP服务器
事务流程：
server接收Wedo的请求帧，由client发给第三方ModbusTCP服务器，
client接收第三方ModbusTCP服务器的数据帧，由server返回Wedo，
