#!/usr/bin/env bash

# -E 确保 trap 能够捕捉到任意信号
# -e 当命令失败立即退出
# -u 遇到未定义变量，报错并立即退出
# -o pipefail 确保正确返回错误码

set -Eeuo pipefail

# 捕捉信号，执行清理脚本
trap cleanup SIGINT SIGTERM ERR EXIT

# 确定当前脚本目录，并尝试切换到脚本所在目录
script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" &>/dev/null && pwd -P)

# 使用帮助
usage() {
  cat <<EOF
Usage: $(basename "${BASH_SOURCE[0]}") [-h] [-v] [-f] -p param_value arg1 [arg2...]
Script description here.
Available options:
-h, --help      Print this help and exit
-v, --verbose   Print script debug info
-f, --flag      Some flag description
-p, --param     Some param description
EOF
  exit
}

# 清理脚本
cleanup() {
  trap - SIGINT SIGTERM ERR EXIT
  # 在这里写清理脚本
}

# 设置颜色
setup_colors() {
  if [[ -t 2 ]] && [[ -z "${NO_COLOR-}" ]] && [[ "${TERM-}" != "dumb" ]]; then
    NOFORMAT='\033[0m' RED='\033[0;31m' GREEN='\033[0;32m' ORANGE='\033[0;33m' BLUE='\033[0;34m' PURPLE='\033[0;35m' CYAN='\033[0;36m' YELLOW='\033[1;33m'
  else
    NOFORMAT='' RED='' GREEN='' ORANGE='' BLUE='' PURPLE='' CYAN='' YELLOW=''
  fi
}

# 打印带颜色的消息
msg() {
  echo >&2 -e "${1-}"
}

# 退出脚本
die() {
  local msg=$1
  local code=${2-1} # default exit status 1
  msg "$msg"
  exit "$code"
}

# 解析选项和参数
parse_params() {
  # default values of variables set from params
  flag=0
#  param=''

  while :; do
    case "${1-}" in
    -h | --help) usage ;;
    -v | --verbose) set -x ;;
    --no-color) NO_COLOR=1 ;;
#    -f | --flag) flag="${2-}" ;; # example flag
#    -p | --param) # example named parameter
#      param="${2-}"
#      shift
#      ;;
    -?*) die "Unknown option: $1" ;;
    *) break ;;
    esac
    shift
  done

#  args=("$@")

  # 检查必填选项
#  [[ -z "${param-}" ]] && die "Missing required parameter: param"
  # 检查是否输出参数
#  [[ ${#args[@]} -eq 0 ]] && die "Missing script arguments"

  return 0
}

parse_params "$@"
setup_colors

# 在这里写脚本逻辑
#
# ssh配置
#
ssh_config(){
  msg "${GREEN}============================
    SSH Key Installer
    V1.0 Alpha
    Author:Kirito
  ============================${NOFORMAT}"
  read -p '请输入github 用户名以获取公钥：' name
  if [[ ! $name ]] ;then
    msg "${RED}github 用户名 不能为空"
  fi
  msg "${BLUE}ssh public key ====> https://github.com/$name.keys${NOFORMAT}"
  read -p '请输入ssh端口（默认19596）：' port
  if [[ ! $port ]] ;then
    port=19596
  fi
  msg "${BLUE}new Port ====> $port${NOFORMAT}"
  cd ~
  mkdir -p .ssh
  cd .ssh
  curl -fsSL https://github.com/$name.keys > authorized_keys
  chmod 700 authorized_keys
  cd ../
  chmod 600 .ssh
  cd /etc/ssh/

  sed -i "/PasswordAuthentication no/c PasswordAuthentication no" sshd_config
  # sed -i "/RSAAuthentication no/c RSAAuthentication yes" sshd_config
  sed -i "/PubkeyAuthentication no/c PubkeyAuthentication yes" sshd_config
  sed -i "/PasswordAuthentication yes/c PasswordAuthentication no" sshd_config
  # sed -i "/RSAAuthentication yes/c RSAAuthentication yes" sshd_config
  sed -i "/PubkeyAuthentication yes/c PubkeyAuthentication yes" sshd_config
  sed -i "s|.*Port=.*|Port=$port|" /etc/ssh/sshd_config
  sed -i "s|.*Port .*|Port $port|" /etc/ssh/sshd_config
  # 一个小时ssh保活
  sed -i "s|.*ClientAliveInterval .*|ClientAliveInterval 1200|" /etc/ssh/sshd_config
  sed -i "s|.*ClientAliveCountMax .*|ClientAliveCountMax 3|" /etc/ssh/sshd_config
  service sshd restart
  service ssh restart
  systemctl restart sshd
  systemctl restart ssh
  cd ~
  msg "${GREEN}ssh config success${NOFORMAT}"
}


init() {
  # 设置时区
  cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime
  # 初始化
  msg "${BLUE}init...${NOFORMAT}"
  apt-get update
  apt-get install -y git zsh curl wget autojump vim
  chsh -s $(which zsh)
  # 配置ssh
  ssh_config

  sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"
}

zshUpgrade() {
  sed -i 's|ZSH_THEME=".*"|ZSH_THEME="agnoster"|' ~/.zshrc
#  msg "${GREEN}安装powerlevel10k主题${NOFORMAT}"
#  git clone --depth=1 https://github.com/romkatv/powerlevel10k.git ${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/themes/powerlevel10k
#  echo 'source ~/powerlevel10k/powerlevel10k.zsh-theme' >>~/.zshrc
#  p10k configure

  msg "${BLUE}安装zsh-autosuggestions插件${NOFORMAT}"
  git clone https://github.com/zsh-users/zsh-autosuggestions ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/zsh-autosuggestions
  echo "plugins=(zsh-autosuggestions)" >>~/.zshrc

  msg "${BLUE}安装zsh-syntax-highlighting插件${NOFORMAT}"
  git clone https://github.com/zsh-users/zsh-syntax-highlighting.git ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/zsh-syntax-highlighting
  echo "plugins=(zsh-syntax-highlighting)" >>~/.zshrc

  msg "${BLUE}安装zsh-completions插件${NOFORMAT}"
  git clone https://github.com/zsh-users/zsh-completions.git ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/zsh-completions
  echo "plugins=(zsh-completions)" >>~/.zshrc

  msg "${BLUE}安装zsh-history-substring-search插件${NOFORMAT}"
  git clone https://github.com/zsh-users/zsh-history-substring-search.git ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/zsh-history-substring-search
  echo "plugins=(zsh-history-substring-search)" >>~/.zshrc

  source ~/.zshrc
  msg "${GREEN}安装zsh优化完成${NOFORMAT}"
}

sysDD(){
  msg "${BLUE}启动系统DD...${NOFORMAT}"
  read -p '请输入初始ssh端口（默认19596）：' port
  if [[ ! $port ]] ;then
    port=19596
  fi
  read -p '请输入初始密码（默认Ximplez）：' pwd
  if [[ ! $pwd ]] ;then
    pwd=Ximplez
  fi
  apt-get update && apt-get install -y curl && sh -c $(curl -fsSL https://raw.githubusercontent.com/ximplez/resource/main/vps/dd.sh) -d 12 -v 64 -a -p $pwd -port $port
}

#
#  菜单
#
Start(){
  cat << END
    0. 退出
    1. 初始化（默认安装zsh，最后请输入y，切换到新shell，否则无法美化）
    2. ZSH美化（强依赖初始化步骤）
    4. 系统设置
    5. 安装v2ray
    99. 系统DD
END
  read -p "请输入你的选择: " step
  case $step in
      1) init ;;
      2) zshUpgrade ;;
      4) sys_config ;;
      99) sysDD ;;
  esac
  msg "${GREEN}脚本执行完毕！${NOFORMAT}"
}
Start
#msg "${RED}Read parameters:${NOFORMAT}"
#msg "- flag: ${flag}"
#msg "- param: ${param}"
#msg "- arguments: ${args[*]-}"