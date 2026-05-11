declare namespace Notice{

  type NoticeInfo = {
    title: string
    content: string
    displayType: number
    oneRead: number
    url: string
    isLogin: number
  } & Common.InfoBase

}
