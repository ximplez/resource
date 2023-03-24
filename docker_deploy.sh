#!/bin/bash

while getopts ":i:e:u:p:s:" opt
do
    case $opt in
        i)
            # 完整镜像地址:tag
            IMAGE_TAG=$OPTARG
            ;;
        e)
            # 环境标识
            BUILD_ENV=$OPTARG
            ;;
        u)
            # docker 用户名
            DOCKER_USERNAME=$OPTARG
            ;;
        p)
            # docker 密码保存路径
            DOCKER_PASSWORD_PATH=$OPTARG
            ;;
        s)
            # docker运行隐私参数
            DOCKER_RUN_ARGS=$OPTARG
            ;;
        ?)
            echo "未知参数 $OPTARG"
            ;;
        :)
            echo "没有输入任何选项 $OPTARG"
            ;;
        *)
            # 发生不能预料的错误时。
            echo "处理选项时出现未知错误"
            ;;
    esac
done

echo -e '[INFO] 开始执行脚本 ...\n'
echo -e '[INFO] 当前路径 :\n'
echo -e `pwd`
echo -e '[INFO] 当前路径文件 ...\n'
echo -e `ls`
echo -e '\n[INFO] 开始环境准备 ...\n'
#   % 表示匹配方式为从右向左匹配，在第一个字符匹配成功后结束
#   %% 表示匹配方式为从右向左匹配，在最后一个字符匹配成功后结束
#   # 表示匹配方式为从左向右匹配，在第一个字符匹配成功后结束
#   ## 表示匹配方式为从左向右匹配，在最后一个字符匹配成功后结束
#   * 表示删除，在匹配字符的右边表示删除不匹配就删除字符右边的
REGISTRY=${IMAGE_TAG%%/*}
BASE_IMAGE_NAME=${IMAGE_TAG%%:*}
PROJECT_NAME=${BASE_IMAGE_NAME##*/}
CONTAINER_NAME=$PROJECT_NAME-$BUILD_ENV
# 如果tag包含latest，就用latest，否则用最后一个tag运行
if [[ $IMAGE_TAG =~ 'latest' ]] ;then 
    IMAGE_NAME=$BASE_IMAGE_NAME:latest
else
    IMAGE_NAME=$BASE_IMAGE_NAME:${IMAGE_TAG##*:}
fi
echo -e "IMAGE_TAG=$IMAGE_TAG\n" 
echo -e "BASE_IMAGE_NAME=$BASE_IMAGE_NAME\n"
echo -e "IMAGE_NAME=$IMAGE_NAME\n"
echo -e "REGISTRY=$REGISTRY\n"
echo -e "BUILD_ENV=$BUILD_ENV\n"
echo -e "PROJECT_NAME=$PROJECT_NAME\n" 
echo -e "CONTAINER_NAME=$CONTAINER_NAME\n" 
echo -e "DOCKER_USERNAME=$DOCKER_USERNAME\n" 
echo -e "DOCKER_PASSWORD_PATH=$DOCKER_PASSWORD_PATH\n"
echo -e "DOCKER_RUN_ARGS=$DOCKER_RUN_ARGS\n"

run_code="docker run -d --name $CONTAINER_NAME -v /opt/logs/$PROJECT_NAME:/log $DOCKER_RUN_ARGS $IMAGE_NAME"
echo "run order: $run_code"

echo -e "\n[INFO] 环境准备完成 ...\n"
if [[ $DOCKER_USERNAME ]] ;then 
    echo -e "[INFO] 登陆 $REGISTRY #user: $DOCKER_USERNAME\n"
    res=`cat $DOCKER_PASSWORD_PATH | docker login $REGISTRY --username=$DOCKER_USERNAME --password-stdin`
    if [[ $res =~ "Succeeded" ]] ;then
        echo -e "[INFO] 登陆成功\n"
    else
        echo -e "[ERROR] 登陆失败\n"
        echo -e $res
        exit 1
    fi
fi
echo -e "[INFO] 停止容器: $CONTAINER_NAME\n"
echo -e `docker stop $CONTAINER_NAME`
echo -e "[INFO] 删除容器: $CONTAINER_NAME\n"
echo -e `docker rm $CONTAINER_NAME`
echo -e "[INFO] 删除镜像: $BASE_IMAGE_NAME\n"
echo -e `docker rmi `docker images | grep $BASE_IMAGE_NAME | awk "{print $3}"``
echo -e "[INFO] 拉取镜像: $IMAGE_NAME\n"
echo -e `docker pull $IMAGE_NAME`
echo -e "[INFO] 启动镜像: $CONTAINER_NAME\n"
set -x
echo -e `$run_code`
echo -e "[INFO] 启动完成!"
exit 0
