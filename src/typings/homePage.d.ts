declare namespace HomePage{

  type State = {
    active: string
    spaceId: number // 空间的id
    notesList: Info[]
  }

}

declare namespace HomePage.quest{

  type LoginReqest = {
    username: string
    password: string
    vcode?: string
  }

  type LoginResponse = {
    token: string
  } & User.Info

  type ResetPasswordByVCodeReqest = {
  } & System.Register.SendRegisterVcodeRquest

}
