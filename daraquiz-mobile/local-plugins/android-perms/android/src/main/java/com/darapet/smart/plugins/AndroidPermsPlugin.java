package com.darapet.smart.plugins;

import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AndroidPerms")
public class AndroidPermsPlugin extends Plugin {
    // This plugin exists solely to inject Android permissions via manifest merge.
    // No JS bridge methods are needed.
}
