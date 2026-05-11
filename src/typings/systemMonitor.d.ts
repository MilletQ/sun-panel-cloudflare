declare namespace SystemMonitor {

  type CPUInfo = {
    coreCount: number
    cpuNum: number
    model: string
    usages: number[]
  }

  type DiskInfo = {
    mountpoint: string
    total: number
    used: number
    free: number
    usedPercent: number
  }

  type NetIOCountersInfo = {
    bytesSent: number
    bytesRecv: number
    name: string
  }

  type MemoryInfo = {
    total: number
    used: number
    free: number
    usedPercent: number
  }

  type GetAllRes = {
    cpuInfo: CPUInfo
    diskInfo: DiskInfo[]
    netIOCountersInfo: NetIOCountersInfo[]
    memoryInfo: MemoryInfo
  }

  type Mountpoint = {
    device: string
    mountpoint: string
    fstype: string
  }
}
