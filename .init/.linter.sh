#!/bin/bash
cd /home/kavia/workspace/code-generation/data-explorer-crossplot-98724-98761/crossplot_frontend
npm run build
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
   exit 1
fi

