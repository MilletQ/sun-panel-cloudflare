declare namespace Login{

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
